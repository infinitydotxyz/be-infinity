import {
  ChainId,
  ChainOBOrder,
  Collection,
  CreationFlow,
  EntrantLedgerItemVariant,
  EntrantOrderItem,
  Erc721Metadata,
  FirestoreOrder,
  FirestoreOrderItem,
  InfinityLinkType,
  OBOrderStatus,
  PreMergeEntrantOrderLedgerItem,
  Token
} from '@infinityxyz/lib/types/core';
import { EventType, MultiOrderEvent, OrderBookEvent, OrderItemData } from '@infinityxyz/lib/types/core/feed';
import { ChainNFTsDto, SignedOBOrderDto } from '@infinityxyz/lib/types/dto/orders';
import { firestoreConstants, getInfinityLink, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import CollectionsService from 'collections/collections.service';
import { NftsService } from 'collections/nfts/nfts.service';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';
import { ContractService } from 'ethereum/contract.service';
import { EthereumService } from 'ethereum/ethereum.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { FirestoreDistributedCounter } from 'firebase/firestore-counter';
import { FirebaseService } from '../firebase/firebase.service';
import { CursorService } from '../pagination/cursor.service';
import { UserParserService } from '../user/parser/parser.service';
import { UserService } from '../user/user.service';
import { getReservoirAsks, getReservoirBids } from '../utils/reservoir';
import { ReservoirResponse } from '../utils/reservoir-types';
import { BaseOrdersService } from './base-orders/base-orders.service';
import { ChainOBOrderHelper } from './chain-ob-order-helper';
import { OrderItemTokenMetadata, OrderMetadata } from './order.types';
import { UserOrdersService } from './user-orders/user-orders.service';

@Injectable()
export default class OrdersService extends BaseOrdersService {
  private numBuyOrderItems: FirestoreDistributedCounter;
  private numSellOrderItems: FirestoreDistributedCounter;
  private openBuyInterest: FirestoreDistributedCounter;
  private openSellInterest: FirestoreDistributedCounter;

  constructor(
    firebaseService: FirebaseService,
    cursorService: CursorService,
    private userService: UserService,
    private collectionService: CollectionsService,
    private nftsService: NftsService,
    private userParser: UserParserService,
    private ethereumService: EthereumService,
    protected userOrdersService: UserOrdersService,
    contractService: ContractService
  ) {
    super(firebaseService, contractService, cursorService);
    const ordersCounterDocRef = this.firebaseService.firestore
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(firestoreConstants.COUNTER_DOC);
    // num items
    this.numBuyOrderItems = new FirestoreDistributedCounter(
      ordersCounterDocRef,
      firestoreConstants.NUM_BUY_ORDER_ITEMS_FIELD
    );
    this.numSellOrderItems = new FirestoreDistributedCounter(
      ordersCounterDocRef,
      firestoreConstants.NUM_SELL_ORDER_ITEMS_FIELD
    );
    // start prices
    this.openBuyInterest = new FirestoreDistributedCounter(
      ordersCounterDocRef,
      firestoreConstants.OPEN_BUY_INTEREST_FIELD
    );
    this.openSellInterest = new FirestoreDistributedCounter(
      ordersCounterDocRef,
      firestoreConstants.OPEN_SELL_INTEREST_FIELD
    );
  }

  private updateOrderCounters(order: ChainOBOrderHelper) {
    if (order.isSellOrder) {
      this.numSellOrderItems.incrementBy(order.numItems);
      this.openSellInterest.incrementBy(order.startPriceEth);
    } else {
      this.numBuyOrderItems.incrementBy(order.numItems);
      this.openBuyInterest.incrementBy(order.startPriceEth);
    }
  }

  public async createOrder(chainId: ChainId, maker: string, orders: ChainOBOrderHelper[]): Promise<void> {
    try {
      const fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
      const ordersCollectionRef = this.firebaseService.firestore.collection(firestoreConstants.ORDERS_COLL);
      const makerProfile = await this.userService.getProfileForUserAddress(maker);
      const makerUsername = makerProfile?.username ?? '';

      // get metadata for orders
      const metadata = await this.getOrderMetadata(
        chainId,
        orders.map((item) => item.getSignedOrder())
      );

      for (const order of orders) {
        // get data
        await this.userOrdersService.claimNonce(order.signer, chainId, order.nonce);
        const orderId = order.hash();
        const dataToStore = this.getFirestoreOrder(chainId, makerUsername, order);
        // save
        const docRef = ordersCollectionRef.doc(orderId);
        fsBatchHandler.add(docRef, dataToStore, { merge: true });

        // update counters
        try {
          this.updateOrderCounters(order);
        } catch (err) {
          console.error('Error updating order counters on post order', err);
        }

        // get order items
        const orderItemsRef = docRef.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL);
        const orderItems: (FirestoreOrderItem & { orderItemId: string })[] = [];
        for (const nft of order.nfts) {
          if (nft.tokens.length === 0) {
            // to support any tokens from a collection type orders
            const emptyToken: OrderItemTokenMetadata = {
              tokenId: '',
              numTokens: 1, // default for both ERC721 and ERC1155
              tokenImage: '',
              tokenName: '',
              tokenSlug: '',
              attributes: []
            };
            const collection = metadata?.[chainId]?.[nft.collection]?.collection ?? {};
            const orderItemData = await this.getFirestoreOrderItem(
              chainId,
              order,
              nft,
              emptyToken,
              orderId,
              makerUsername,
              collection
            );

            // add to batch
            const orderItemDocRef = orderItemsRef.doc();
            fsBatchHandler.add(orderItemDocRef, orderItemData, { merge: true });
            orderItems.push({ ...orderItemData, orderItemId: orderItemDocRef.id });
          } else {
            for (const token of nft.tokens) {
              const orderItemMetadata = metadata?.[chainId]?.[nft.collection];
              const tokenData = orderItemMetadata?.nfts?.[token.tokenId];
              const collection = orderItemMetadata?.collection ?? {};
              const orderItemTokenMetadata: OrderItemTokenMetadata = {
                tokenId: token.tokenId,
                numTokens: token.numTokens, // default for both ERC721 and ERC1155
                tokenImage:
                  tokenData?.image?.url || tokenData?.alchemyCachedImage || tokenData?.image?.originalUrl || '',
                tokenName: tokenData?.metadata?.name ?? '',
                tokenSlug: tokenData?.slug ?? '',
                attributes: (tokenData?.metadata as Erc721Metadata)?.attributes ?? [] // todo: ERC1155?
              };

              const orderItemData = await this.getFirestoreOrderItem(
                chainId,
                order,
                nft,
                orderItemTokenMetadata,
                orderId,
                makerUsername,
                collection
              );

              // add to batch
              const orderItemDocRef = orderItemsRef.doc();
              fsBatchHandler.add(orderItemDocRef, orderItemData, { merge: true });
              orderItems.push({ ...orderItemData, orderItemId: orderItemDocRef.id });
            }
          }
        }

        // write order to feed
        this.writeOrderToFeed(chainId, makerUsername, order, orderItems, fsBatchHandler);
        const currentBlockNumber = await this.ethereumService.getCurrentBlockNumber(chainId);
        await this.writeOrderToRewards(dataToStore, orderItems, fsBatchHandler, currentBlockNumber);
      }
      // commit batch
      await fsBatchHandler.flush();
    } catch (err) {
      console.error('Failed to create order(s)', err);
      throw err;
    }
  }

  private async getOrderMetadata(chainId: ChainId, orders: ChainOBOrder[]): Promise<OrderMetadata> {
    type CollectionAddress = string;
    type TokenId = string;
    const tokens: Map<ChainId, Map<CollectionAddress, Set<TokenId>>> = new Map();

    for (const order of orders) {
      const collectionsByChainId = tokens.get(chainId) ?? new Map<CollectionAddress, Set<TokenId>>();
      for (const nft of order.nfts) {
        const tokensByCollection = collectionsByChainId.get(nft.collection) ?? new Set();
        for (const token of nft.tokens) {
          tokensByCollection.add(token.tokenId);
        }
        if (nft.tokens.length === 0) {
          tokensByCollection.add('');
        }
        collectionsByChainId.set(nft.collection, tokensByCollection);
      }
      tokens.set(chainId, collectionsByChainId);
    }

    const metadata: OrderMetadata = {};
    for (const [chainId, collections] of tokens) {
      const collectionsData = await Promise.all(
        [...collections].map(([address]) => {
          return this.collectionService.getCollectionByAddress({
            address,
            chainId
          });
        })
      );
      const collectionsByAddress = collectionsData.reduce((acc: { [address: string]: Collection }, collection) => {
        if (!collection?.state?.create?.step || collection?.state?.create?.step === CreationFlow.CollectionMetadata) {
          // return error
          throw new InvalidCollectionError(
            collection?.address ?? 'Unknown',
            collection?.chainId ?? 'Unknown',
            'Collection indexing is not complete'
          );
        }
        return {
          ...acc,
          [collection.address]: collection
        };
      }, {});

      for (const [collectionAddress, collection] of Object.entries(collectionsByAddress)) {
        metadata[collection.chainId] = {
          ...metadata[chainId],
          [collectionAddress]: {
            ...(metadata[chainId]?.[collectionAddress] ?? {}),
            collection,
            nfts: {}
          }
        };
      }

      const tokenProps = [...collections.entries()].flatMap(([collectionAddress, tokenIds]) => {
        return [...tokenIds]
          .filter((item) => !!item)
          .map((tokenId) => {
            return {
              address: collectionAddress,
              tokenId: tokenId,
              chainId: chainId
            };
          });
      });

      const tokens = await this.nftsService.getNfts(tokenProps);
      for (const token of tokens) {
        if (!token || !token.collectionAddress) {
          throw new InvalidTokenError('Unknown', chainId, 'Unknown', `Failed to find token`);
        }
        metadata[chainId] = {
          ...metadata[chainId],
          [token.collectionAddress]: {
            ...(metadata[chainId]?.[token.collectionAddress] ?? {}),
            collection: collectionsByAddress[token.collectionAddress],
            nfts: {
              ...(metadata[chainId]?.[token.collectionAddress]?.nfts ?? {}),
              [token.tokenId]: token as Token
            }
          }
        };
      }
    }

    return metadata;
  }

  async getReservoirOrders(
    limit: number,
    sellOrders: boolean,
    buyOrders: boolean,
    cursor: string
  ): Promise<ReservoirResponse> {
    let result: SignedOBOrderDto[] = [];
    let buyResponse;
    let sellResponse;

    let sellCursor;
    let buyCursor;
    if (cursor) {
      const cursorObj = JSON.parse(cursor);

      if (cursorObj.buyCursor) {
        buyCursor = cursorObj.buyCursor;
      }
      if (cursorObj.sellCursor) {
        sellCursor = cursorObj.sellCursor;
      }
    }

    if (sellOrders) {
      sellResponse = await getReservoirAsks(limit, sellCursor);

      result = result.concat(sellResponse.orders);
    }

    if (buyOrders) {
      buyResponse = await getReservoirBids(limit, buyCursor);

      result = result.concat(buyResponse.orders);
    }

    // get the cursor
    const cursorObj = { buyCursor: buyResponse?.cursor ?? '', sellCursor: sellResponse?.cursor ?? '' };

    // sort again combining lists
    result.sort((a, b) => {
      return a.endTimeMs - b.endTimeMs;
    });

    // console.log(JSON.stringify(result, null, 2));
    return { orders: result, cursor: JSON.stringify(cursorObj) };
  }

  private getFirestoreOrder(chainId: ChainId, makerUsername: string, order: ChainOBOrderHelper): FirestoreOrder {
    try {
      const orderStatus =
        order.startTimeMs <= Date.now() && order.endTimeMs >= Date.now()
          ? OBOrderStatus.ValidActive
          : OBOrderStatus.ValidInactive;
      const data: FirestoreOrder = {
        id: order.hash(),
        orderStatus,
        chainId: chainId,
        isSellOrder: order.isSellOrder,
        numItems: order.numItems,
        startPriceEth: order.startPriceEth,
        endPriceEth: order.endPriceEth,
        startTimeMs: order.startTimeMs,
        endTimeMs: order.endTimeMs,
        maxGasPriceWei: order.maxGasPrice,
        nonce: parseInt(order.nonce, 10),
        complicationAddress: order.complication,
        currencyAddress: order.currency,
        makerAddress: order.signer,
        makerUsername: makerUsername,
        signedOrder: order.getSignedOrder()
      };
      return data;
    } catch (err) {
      console.error('Failed to get firestore order from signed order', err);
      throw err;
    }
  }

  private async getFirestoreOrderItem(
    chainId: ChainId,
    order: ChainOBOrderHelper,
    nft: ChainNFTsDto,
    token: OrderItemTokenMetadata,
    orderId: string,
    makerUsername: string,
    collection: Partial<Collection>
  ): Promise<FirestoreOrderItem> {
    let takerAddress = '';
    let takerUsername = '';
    if (!order.isSellOrder && nft.collection && token.tokenId) {
      // for buy orders, fetch the current owner of the token
      takerAddress = await this.ethereumService.getErc721Owner({
        address: nft.collection,
        tokenId: token.tokenId,
        chainId: chainId
      });
      if (takerAddress) {
        const taker = await this.userParser.parse(takerAddress);
        const takerProfile = await this.userService.getProfile(taker);
        takerUsername = takerProfile?.username ?? '';
      }
    }

    const orderStatus =
      order.startTimeMs <= Date.now() && order.endTimeMs >= Date.now()
        ? OBOrderStatus.ValidActive
        : OBOrderStatus.ValidInactive;

    const data: FirestoreOrderItem = {
      id: orderId,
      orderStatus,
      chainId: chainId,
      isSellOrder: order.isSellOrder,
      numItems: order.numItems,
      startPriceEth: order.startPriceEth,
      endPriceEth: order.endPriceEth,
      currencyAddress: order.currency,
      startTimeMs: order.startTimeMs,
      endTimeMs: order.endTimeMs,
      makerAddress: trimLowerCase(order.signer),
      makerUsername: trimLowerCase(makerUsername),
      takerAddress: trimLowerCase(takerAddress),
      takerUsername: trimLowerCase(takerUsername),
      collectionAddress: nft.collection,
      collectionName: collection.metadata?.name ?? '',
      collectionImage: collection.metadata?.profileImage ?? '',
      collectionSlug: collection?.slug ?? '',
      hasBlueCheck: collection.hasBlueCheck ?? false,
      tokenId: token.tokenId,
      numTokens: token.numTokens,
      tokenImage: token.tokenImage ?? '',
      tokenName: token.tokenName ?? '',
      tokenSlug: token.tokenSlug ?? '',
      complicationAddress: order.complication,
      attributes: token.attributes
    };
    return data;
  }

  protected async writeOrderToRewards(
    order: FirestoreOrder,
    orderItems: (FirestoreOrderItem & { orderItemId: string })[],
    batchHandler: FirestoreBatchHandler,
    currentBlockNumber: number
  ) {
    if (order.chainId !== ChainId.Mainnet) {
      // skip raffles for non-mainnet orders, we cannot get a floor price for these
      return;
    }

    const itemsWithFloorPrices = await Promise.all(
      orderItems.map(async (item) => {
        try {
          const floorPriceEth = await this.collectionService.getFloorPrice({
            chainId: item.chainId as ChainId,
            address: item.collectionAddress
          });
          return {
            ...item,
            floorPriceEth
          };
        } catch (err) {
          return {
            ...item,
            floorPriceEth: null
          };
        }
      })
    );

    this.writeOrderToRaffles(order, itemsWithFloorPrices, batchHandler, currentBlockNumber);
    this.writeOrderToRewardsLedger(order, itemsWithFloorPrices, batchHandler, currentBlockNumber);
  }

  protected writeOrderToRewardsLedger(
    order: FirestoreOrder,
    itemsWithFloorPrices: (FirestoreOrderItem & { orderItemId: string; floorPriceEth: number | null })[],
    batchHandler: FirestoreBatchHandler,
    currentBlockNumber: number
  ) {
    const isListing = order.signedOrder.isSellOrder;

    if (isListing) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const blockNumber = currentBlockNumber;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const items = itemsWithFloorPrices.map((item) => {
        const orderItem: EntrantOrderItem = {
          isTopCollection: item.hasBlueCheck,
          floorPriceEth: item.floorPriceEth,
          isSellOrder: item.isSellOrder,
          startTimeMs: item.startTimeMs,
          endTimeMs: item.endTimeMs,
          hasBlueCheck: item.hasBlueCheck,
          collectionAddress: item.collectionAddress,
          collectionSlug: item.collectionSlug,
          startPriceEth: item.startPriceEth,
          endPriceEth: item.endPriceEth,
          tokenId: item.tokenId,
          numTokens: item.numTokens,
          makerAddress: item.makerAddress
        };
        return orderItem;
      });
    }

    // TODO save to db
    // const entrantOrder: PreMergeEntrantOrderLedgerItem = {
    //   discriminator: isListing ? EntrantLedgerItemVariant.Listing : EntrantLedgerItemVariant.Offer,
    //   order: {
    //     id: order.id,
    //     chainId: order.chainId as ChainId,
    //     numItems: order.numItems,
    //     items
    //   },
    //   blockNumber,
    //   isAggregated: false,
    //   chainId: order.chainId as ChainId,
    //   updatedAt: Date.now(),
    //   entrantAddress: order.makerAddress
    // };

    // const ref = this.firebaseService.firestore
    //   .collection(firestoreConstants.USERS_COLL)
    //   .doc(order.makerAddress)
    //   .collection('userRaffleOrdersLedger')
    //   .doc(order.id);

    // batchHandler.add(ref, entrantOrder, { merge: false });
  }

  protected writeOrderToRaffles(
    order: FirestoreOrder,
    itemsWithFloorPrices: (FirestoreOrderItem & { orderItemId: string; floorPriceEth: number | null })[],
    batchHandler: FirestoreBatchHandler,
    currentBlockNumber: number
  ) {
    const isListing = order.signedOrder.isSellOrder;
    const blockNumber = currentBlockNumber;
    const items = itemsWithFloorPrices.map((item) => {
      const orderItem: EntrantOrderItem = {
        isTopCollection: item.hasBlueCheck,
        floorPriceEth: item.floorPriceEth,
        isSellOrder: item.isSellOrder,
        startTimeMs: item.startTimeMs,
        endTimeMs: item.endTimeMs,
        hasBlueCheck: item.hasBlueCheck,
        collectionAddress: item.collectionAddress,
        collectionSlug: item.collectionSlug,
        startPriceEth: item.startPriceEth,
        endPriceEth: item.endPriceEth,
        tokenId: item.tokenId,
        numTokens: item.numTokens,
        makerAddress: item.makerAddress
      };
      return orderItem;
    });
    const entrantOrder: PreMergeEntrantOrderLedgerItem = {
      discriminator: isListing ? EntrantLedgerItemVariant.Listing : EntrantLedgerItemVariant.Offer,
      order: {
        id: order.id,
        chainId: order.chainId as ChainId,
        numItems: order.numItems,
        items
      },
      blockNumber,
      isAggregated: false,
      chainId: order.chainId as ChainId,
      updatedAt: Date.now(),
      entrantAddress: order.makerAddress
    };

    const ref = this.firebaseService.firestore
      .collection(firestoreConstants.USERS_COLL)
      .doc(order.makerAddress)
      .collection('userRaffleOrdersLedger')
      .doc(order.id);

    batchHandler.add(ref, entrantOrder, { merge: false });
  }

  private writeOrderToFeed(
    chainId: ChainId,
    makerUsername: string,
    order: ChainOBOrderHelper,
    orderItems: (FirestoreOrderItem & { orderItemId: string })[],
    batchHandler: FirestoreBatchHandler
  ) {
    // multi/any order type
    if (orderItems.length === 0 || orderItems.length > 1) {
      this.writeMultiOrderToFeed(chainId, makerUsername, order, orderItems, batchHandler);
    } else {
      this.writeSingleOrderToFeed(chainId, makerUsername, order, orderItems[0], batchHandler);
    }
  }

  private writeSingleOrderToFeed(
    chainId: ChainId,
    makerUsername: string,
    order: ChainOBOrderHelper,
    orderItem: FirestoreOrderItem & { orderItemId: string },
    batchHandler: FirestoreBatchHandler
  ) {
    const feedCollection = this.firebaseService.firestore.collection(firestoreConstants.FEED_COLL);
    const usersInvolved = [orderItem.makerAddress, orderItem.takerAddress].filter((address) => !!address);
    const feedEvent: OrderBookEvent = {
      orderId: orderItem.id,
      isSellOrder: order.isSellOrder,
      type: order.isSellOrder ? EventType.NftListing : EventType.NftOffer,
      orderItemId: orderItem.orderItemId,
      paymentToken: orderItem.currencyAddress,
      quantity: orderItem.numTokens,
      startPriceEth: orderItem.startPriceEth,
      endPriceEth: orderItem.endPriceEth,
      startTimeMs: orderItem.startTimeMs,
      endTimeMs: orderItem.endTimeMs,
      makerUsername: orderItem.makerUsername,
      makerAddress: orderItem.makerAddress,
      takerUsername: orderItem.takerUsername,
      takerAddress: orderItem.takerAddress,
      usersInvolved,
      tokenId: orderItem.tokenId,
      chainId: orderItem.chainId,
      likes: 0,
      comments: 0,
      timestamp: Date.now(),
      collectionAddress: orderItem.collectionAddress,
      collectionName: orderItem.collectionName,
      collectionSlug: orderItem.collectionSlug,
      collectionProfileImage: orderItem.collectionImage,
      hasBlueCheck: orderItem.hasBlueCheck,
      internalUrl: getInfinityLink({
        type: InfinityLinkType.Asset,
        collectionAddress: orderItem.collectionAddress,
        tokenId: orderItem.tokenId,
        chainId: orderItem.chainId as ChainId
      }),
      image: orderItem.tokenImage,
      nftName: orderItem.tokenName,
      nftSlug: orderItem.tokenSlug
    };

    const newDoc = feedCollection.doc();
    batchHandler.add(newDoc, feedEvent, { merge: false });
  }

  private writeMultiOrderToFeed(
    chainId: ChainId,
    makerUsername: string,
    order: ChainOBOrderHelper,
    orderItems: (FirestoreOrderItem & { orderItemId: string })[],
    batchHandler: FirestoreBatchHandler
  ) {
    const feedCollection = this.firebaseService.firestore.collection(firestoreConstants.FEED_COLL);

    const augmentedOrderItems = [];
    for (const orderItem of orderItems) {
      const usersInvolved = [orderItem.makerAddress, orderItem.takerAddress].filter((address) => !!address);
      const orderItemData: OrderItemData = {
        orderItemId: orderItem.orderItemId,
        takerUsername: orderItem.takerUsername,
        takerAddress: orderItem.takerAddress,
        usersInvolved,
        tokenId: orderItem.tokenId,
        chainId: orderItem.chainId,
        collectionAddress: orderItem.collectionAddress,
        collectionName: orderItem.collectionName,
        collectionSlug: orderItem.collectionSlug,
        collectionProfileImage: orderItem.collectionImage,
        hasBlueCheck: orderItem.hasBlueCheck,
        internalUrl: getInfinityLink({
          type: InfinityLinkType.Asset,
          collectionAddress: orderItem.collectionAddress,
          tokenId: orderItem.tokenId,
          chainId: orderItem.chainId as ChainId
        }),
        image: orderItem.tokenImage,
        nftName: orderItem.tokenName,
        nftSlug: orderItem.tokenSlug
      };

      augmentedOrderItems.push(orderItemData);
    }

    const sampleImages = orderItems.map((orderItem) => orderItem.tokenImage);
    const orderData: MultiOrderEvent = {
      title: 'Multi Order',
      orderId: order.hash(),
      chainId: chainId,
      isSellOrder: order.isSellOrder,
      paymentToken: order.currency,
      quantity: order.numItems,
      startPriceEth: order.startPriceEth,
      endPriceEth: order.endPriceEth,
      startTimeMs: order.startTimeMs,
      endTimeMs: order.endTimeMs,
      makerAddress: order.signer,
      makerUsername,
      likes: 0,
      comments: 0,
      timestamp: Date.now(),
      type: order.isSellOrder ? EventType.NftListing : EventType.NftOffer,
      orderItems: augmentedOrderItems,
      sampleImages: sampleImages.slice(0, 3)
    };

    const newDoc = feedCollection.doc();
    batchHandler.add(newDoc, orderData, { merge: false });
  }
}
