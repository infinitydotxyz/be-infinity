import {
  ChainId,
  Collection,
  CreationFlow,
  Erc721Metadata,
  FirestoreOrder,
  FirestoreOrderItem,
  InfinityLinkType,
  OBOrderItem,
  OBOrderStatus,
  OBTokenInfo,
  OrderDirection,
  Token
} from '@infinityxyz/lib/types/core';
import { FeedEventType, NftListingEvent, NftOfferEvent } from '@infinityxyz/lib/types/core/feed';
import {
  ChainNFTsDto,
  OrderItemsOrderBy,
  SignedOBOrderArrayDto,
  SignedOBOrderDto,
  UserOrderItemsQueryDto
} from '@infinityxyz/lib/types/dto/orders';
import { firestoreConstants, getInfinityLink, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import CollectionsService from 'collections/collections.service';
import { NftsService } from 'collections/nfts/nfts.service';
import { BadQueryError } from 'common/errors/bad-query.error';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';
import { EthereumService } from 'ethereum/ethereum.service';
import { BigNumber } from 'ethers';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { FirebaseService } from '../firebase/firebase.service';
import { CursorService } from '../pagination/cursor.service';
import { ParsedUserId } from '../user/parser/parsed-user-id';
import { UserParserService } from '../user/parser/parser.service';
import { UserService } from '../user/user.service';
import { getDocIdHash } from '../utils';
import { OrderItemTokenMetadata, OrderMetadata } from './order.types';
import { getOrderIdFromSignedOrder } from './orders.utils';

@Injectable()
export default class OrdersService {
  constructor(
    private firebaseService: FirebaseService,
    private userService: UserService,
    private collectionService: CollectionsService,
    private nftsService: NftsService,
    private userParser: UserParserService,
    private ethereumService: EthereumService,
    private cursorService: CursorService
  ) {}

  public async createOrder(maker: ParsedUserId, orders: SignedOBOrderDto[]): Promise<void> {
    try {
      const fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
      const ordersCollectionRef = this.firebaseService.firestore.collection(firestoreConstants.ORDERS_COLL);
      const metadata = await this.getOrderMetadata(orders);
      const makerProfile = await this.userService.getProfile(maker);
      const makerUsername = makerProfile?.username ?? '';

      for (const order of orders) {
        // get data
        const orderId = getOrderIdFromSignedOrder(order, maker.userAddress);
        const dataToStore = this.getFirestoreOrderFromSignedOBOrder(maker.userAddress, makerUsername, order, orderId);
        // save
        const docRef = ordersCollectionRef.doc(orderId);
        fsBatchHandler.add(docRef, dataToStore, { merge: true });

        // get order items
        const orderItemsRef = docRef.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL);
        for (const nft of order.signedOrder.nfts) {
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
            const collection = metadata?.[order.chainId as ChainId]?.[nft.collection]?.collection ?? {};
            const orderItemData = await this.getFirestoreOrderItemFromSignedOBOrder(
              order,
              nft,
              emptyToken,
              orderId,
              maker.userAddress,
              makerUsername,
              collection
            );
            // get doc id
            const tokenId = '';
            const orderItemDocRef = orderItemsRef.doc(
              getDocIdHash({ collectionAddress: nft.collection, tokenId, chainId: order.chainId })
            );
            // add to batch
            fsBatchHandler.add(orderItemDocRef, orderItemData, { merge: true });
            this.writeOrderItemsToFeed([{ ...orderItemData, orderItemId: orderItemDocRef.id }], fsBatchHandler);
          } else {
            for (const token of nft.tokens) {
              const orderItemMetadata = metadata?.[order.chainId as ChainId]?.[nft.collection];
              const tokenData = orderItemMetadata?.nfts?.[token.tokenId];
              const collection = orderItemMetadata?.collection ?? {};
              const orderItemTokenMetadata: OrderItemTokenMetadata = {
                tokenId: token.tokenId,
                numTokens: token.numTokens, // default for both ERC721 and ERC1155
                tokenImage: tokenData?.image?.url ?? '',
                tokenName: tokenData?.metadata?.name ?? '',
                tokenSlug: tokenData?.slug ?? '',
                attributes: (tokenData?.metadata as Erc721Metadata)?.attributes ?? [] // todo: ERC1155?
              };

              const orderItemData = await this.getFirestoreOrderItemFromSignedOBOrder(
                order,
                nft,
                orderItemTokenMetadata,
                orderId,
                maker.userAddress,
                makerUsername,
                collection
              );
              // get doc id
              const tokenId = token.tokenId.toString();
              const orderItemDocRef = orderItemsRef.doc(
                getDocIdHash({ collectionAddress: nft.collection, tokenId, chainId: order.chainId })
              );
              // add to batch
              fsBatchHandler.add(orderItemDocRef, orderItemData, { merge: true });
              this.writeOrderItemsToFeed([{ ...orderItemData, orderItemId: orderItemDocRef.id }], fsBatchHandler);
            }
          }
        }
      }
      // commit batch
      await fsBatchHandler.flush();
    } catch (err) {
      console.error('Failed to create order(s)', err);
      throw err;
    }
  }

  public async getSignedOBOrders(
    reqQuery: UserOrderItemsQueryDto,
    user?: ParsedUserId
  ): Promise<SignedOBOrderArrayDto> {
    let firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      this.firebaseService.firestore.collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL);
    let requiresOrderByPrice = false;
    if (reqQuery.orderStatus) {
      firestoreQuery = firestoreQuery.where('orderStatus', '==', reqQuery.orderStatus);
    } else {
      firestoreQuery = firestoreQuery.where('orderStatus', '==', OBOrderStatus.ValidActive);
    }

    if (reqQuery.isSellOrder !== undefined) {
      firestoreQuery = firestoreQuery.where('isSellOrder', '==', reqQuery.isSellOrder);
    }

    if (reqQuery.makerAddress && reqQuery.makerAddress !== user?.userAddress) {
      throw new BadQueryError('Maker address must match user address');
    }

    if (reqQuery.makerAddress) {
      firestoreQuery = firestoreQuery.where('makerAddress', '==', reqQuery.makerAddress);
    }

    if (reqQuery.takerAddress && reqQuery.takerAddress !== user?.userAddress) {
      throw new BadQueryError('Taker address must match user address');
    }

    if (reqQuery.id) {
      firestoreQuery = firestoreQuery.where('id', '==', reqQuery.id);
    }
    
    if (reqQuery.takerAddress) {
      firestoreQuery = firestoreQuery.where('takerAddress', '==', reqQuery.takerAddress);
    }

    if (reqQuery.minPrice !== undefined) {
      firestoreQuery = firestoreQuery.where('startPriceEth', '>=', reqQuery.minPrice);
      requiresOrderByPrice = true;
    }

    if (reqQuery.maxPrice !== undefined) {
      firestoreQuery = firestoreQuery.where('startPriceEth', '<=', reqQuery.maxPrice);
      requiresOrderByPrice = true;
    }

    if (reqQuery.numItems !== undefined) {
      firestoreQuery = firestoreQuery.where('numItems', '==', reqQuery.numItems);
    }

    if (reqQuery.collections && reqQuery.collections.length > 0) {
      firestoreQuery = firestoreQuery.where('collectionAddress', 'in', reqQuery.collections);
    }

    // ordering
    let orderedBy = reqQuery.orderBy;
    if (requiresOrderByPrice) {
      const orderDirection = reqQuery.orderByDirection ?? OrderDirection.Ascending;
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.Price, orderDirection);
      orderedBy = OrderItemsOrderBy.Price;
    } else if (reqQuery.orderBy) {
      firestoreQuery = firestoreQuery.orderBy(reqQuery.orderBy, reqQuery.orderByDirection);
      orderedBy = reqQuery.orderBy;
    } else {
      // default order by startTimeMs desc
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.StartTime, OrderDirection.Descending);
      orderedBy = OrderItemsOrderBy.StartTime;
    }

    // pagination
    type Cursor = Record<OrderItemsOrderBy, number>;
    const cursor = this.cursorService.decodeCursorToObject<Cursor>(reqQuery.cursor);
    const cursorField = cursor[orderedBy];
    if (!Number.isNaN(cursorField) && cursorField != null) {
      firestoreQuery = firestoreQuery.startAfter(cursorField);
    }
    // limit
    firestoreQuery = firestoreQuery.limit(reqQuery.limit + 1); // +1 to check if there are more results

    // query firestore
    const data = await this.getOrders(firestoreQuery);

    let hasNextPage = false;
    if (data.length > reqQuery.limit) {
      hasNextPage = true;
      data.pop();
    }

    const lastItem = data[data.length - 1] ?? {};
    const cursorObj: Cursor = {} as Cursor;
    for (const orderBy of Object.values(OrderItemsOrderBy)) {
      cursorObj[orderBy] = lastItem[orderBy];
    }
    const nextCursor = this.cursorService.encodeCursor(cursorObj);

    return {
      data,
      cursor: nextCursor,
      hasNextPage
    };
  }

  private async getOrderMetadata(orders: SignedOBOrderDto[]): Promise<OrderMetadata> {
    type CollectionAddress = string;
    type TokenId = string;
    const tokens: Map<ChainId, Map<CollectionAddress, Set<TokenId>>> = new Map();

    for (const order of orders) {
      const collectionsByChainId = tokens.get(order.chainId as ChainId) ?? new Map<CollectionAddress, Set<TokenId>>();
      for (const nft of order.signedOrder.nfts) {
        const tokensByCollection = collectionsByChainId.get(nft.collection) ?? new Set();
        for (const token of nft.tokens) {
          tokensByCollection.add(token.tokenId);
        }
        collectionsByChainId.set(nft.collection, tokensByCollection);
      }
      tokens.set(order.chainId as ChainId, collectionsByChainId);
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
        if (collection?.state?.create?.step !== CreationFlow.Complete) {
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

      const tokenProps = [...collections.entries()].flatMap(([collectionAddress, tokenIds]) => {
        return [...tokenIds].map((tokenId) => {
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
          [token.collectionAddress]: {
            collection: collectionsByAddress[token.collectionAddress],
            nfts: {
              [token.tokenId]: token as Token
            }
          }
        };
      }
    }

    return metadata;
  }

  public async getOrders(
    firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>
  ): Promise<SignedOBOrderDto[]> {
    // fetch query snapshot
    const firestoreOrderItems = await firestoreQuery.get();
    const obOrderItemMap: { [key: string]: { [key: string]: OBOrderItem } } = {};
    const results: SignedOBOrderDto[] = [];

    const getSignedOBOrder = (orderItemData: FirestoreOrderItem, orderDocData: FirestoreOrder) => {
      const token: OBTokenInfo = {
        tokenId: orderItemData.tokenId,
        numTokens: orderItemData.numTokens,
        tokenImage: orderItemData.tokenImage,
        tokenName: orderItemData.tokenName,
        takerAddress: orderItemData.takerAddress,
        takerUsername: orderItemData.takerUsername,
        attributes: orderItemData.attributes
      };
      const existingOrder = obOrderItemMap[orderItemData.id];
      if (existingOrder) {
        const existingOrderItem = existingOrder[orderItemData.collectionAddress];
        if (existingOrderItem) {
          existingOrderItem.tokens.push(token);
        } else {
          existingOrder[orderItemData.collectionAddress] = {
            collectionAddress: orderItemData.collectionAddress,
            collectionName: orderItemData.collectionName,
            collectionImage: orderItemData.collectionImage,
            collectionSlug: orderItemData?.collectionSlug,
            hasBlueCheck: orderItemData?.hasBlueCheck,
            tokens: [token]
          };
        }
      } else {
        const obOrderItem: OBOrderItem = {
          collectionAddress: orderItemData.collectionAddress,
          collectionImage: orderItemData.collectionImage,
          collectionName: orderItemData.collectionName,
          collectionSlug: orderItemData?.collectionSlug,
          hasBlueCheck: orderItemData?.hasBlueCheck,
          tokens: [token]
        };
        obOrderItemMap[orderItemData.id] = { [orderItemData.collectionAddress]: obOrderItem };
      }
      const signedOBOrder: SignedOBOrderDto = {
        id: orderItemData.id,
        chainId: orderItemData.chainId,
        isSellOrder: orderItemData.isSellOrder,
        numItems: orderItemData.numItems,
        startPriceEth: orderItemData.startPriceEth,
        endPriceEth: orderItemData.endPriceEth,
        startTimeMs: orderItemData.startTimeMs,
        endTimeMs: orderItemData.endTimeMs,
        nonce: parseInt(orderDocData.nonce, 10),
        makerAddress: orderItemData.makerAddress,
        makerUsername: orderItemData.makerUsername,
        nfts: Object.values(obOrderItemMap[orderItemData.id]),
        signedOrder: orderDocData.signedOrder,
        execParams: {
          complicationAddress: orderDocData.complicationAddress,
          currencyAddress: orderDocData.currencyAddress
        },
        extraParams: {} as any
      };
      return signedOBOrder;
    };

    const orderDocsToGet: { [docId: string]: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> } = {};
    const orderItems = firestoreOrderItems.docs.map((item) => {
      const orderDocId = item.ref.parent.parent?.id;
      if (orderDocId) {
        orderDocsToGet[orderDocId] = item.ref.parent.parent;
      }
      return {
        orderItem: item.data() as FirestoreOrderItem,
        orderDocId: item.ref.parent.parent?.id
      };
    });

    const docRefs = Object.values(orderDocsToGet);
    if (docRefs.length === 0) {
      return [];
    }
    const orderDocs = await this.firebaseService.firestore.getAll(...docRefs);
    const orderDocsById: { [key: string]: FirestoreOrder } = {};
    for (const doc of orderDocs) {
      orderDocsById[doc.id] = doc.data() as FirestoreOrder;
    }

    for (const { orderDocId, orderItem } of orderItems) {
      if (!orderDocId) {
        console.error('Cannot fetch order data from firestore for order item', orderItem.id);
        continue;
      }

      const orderDocData = orderDocsById[orderDocId];
      if (!orderDocData) {
        console.error('Cannot fetch order data from firestore for order item', orderItem.id);
        continue;
      }

      const signedOBOrder = getSignedOBOrder(orderItem, orderDocData);
      results.push(signedOBOrder);
    }

    return results;
  }

  public async getOrderNonce(userId: string): Promise<string> {
    try {
      const user = trimLowerCase(userId);
      const userDocRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(user);
      const updatedNonce = await this.firebaseService.firestore.runTransaction(async (t) => {
        const userDoc = await t.get(userDocRef);
        // todo: use a user dto or type?
        const userDocData = userDoc.data() || { address: user };
        const nonce = BigNumber.from(userDocData.orderNonce ?? '0').add(1);
        const minOrderNonce = BigNumber.from(userDocData.minOrderNonce ?? '0').add(1);
        const newNonce = (nonce.gt(minOrderNonce) ? nonce : minOrderNonce).toString();
        userDocData.orderNonce = newNonce;
        t.set(userDocRef, userDocData, { merge: true });
        return newNonce;
      });
      return updatedNonce;
    } catch (e) {
      console.error('Failed to get order nonce for user', userId);
      throw e;
    }
  }

  private getFirestoreOrderFromSignedOBOrder(
    makerAddress: string,
    makerUsername: string,
    order: SignedOBOrderDto,
    orderId: string
  ): FirestoreOrder {
    try {
      const data: FirestoreOrder = {
        id: orderId,
        orderStatus: OBOrderStatus.ValidActive,
        chainId: order.chainId,
        isSellOrder: order.signedOrder.isSellOrder,
        numItems: order.numItems,
        startPriceEth: order.startPriceEth,
        endPriceEth: order.endPriceEth,
        startTimeMs: order.startTimeMs,
        endTimeMs: order.endTimeMs,
        nonce: order.nonce.toString(),
        complicationAddress: order.execParams.complicationAddress,
        currencyAddress: order.execParams.currencyAddress,
        makerAddress: trimLowerCase(makerAddress),
        makerUsername: trimLowerCase(makerUsername),
        signedOrder: order.signedOrder
      };
      return data;
    } catch (err) {
      console.error('Failed to get firestore order from signed order', err);
      throw err;
    }
  }

  private async getFirestoreOrderItemFromSignedOBOrder(
    order: SignedOBOrderDto,
    nft: ChainNFTsDto,
    token: OrderItemTokenMetadata,
    orderId: string,
    makerAddress: string,
    makerUsername: string,
    collection: Partial<Collection>
  ): Promise<FirestoreOrderItem> {
    let takerAddress = '';
    let takerUsername = '';
    if (!order.signedOrder.isSellOrder && nft.collection && token.tokenId) {
      // for buy orders, fetch the current owner of the token
      takerAddress = await this.ethereumService.getErc721Owner({
        address: nft.collection,
        tokenId: token.tokenId,
        chainId: order.chainId
      });
      if (takerAddress) {
        const taker = await this.userParser.parse(takerAddress);
        const takerProfile = await this.userService.getProfile(taker);
        takerUsername = takerProfile?.username ?? '';
      }
    }
    const data: FirestoreOrderItem = {
      id: orderId,
      orderStatus: OBOrderStatus.ValidActive,
      chainId: order.chainId,
      isSellOrder: order.signedOrder.isSellOrder,
      numItems: order.numItems,
      startPriceEth: order.startPriceEth,
      endPriceEth: order.endPriceEth,
      currencyAddress: order.execParams.currencyAddress,
      startTimeMs: order.startTimeMs,
      endTimeMs: order.endTimeMs,
      makerAddress: trimLowerCase(makerAddress),
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
      complicationAddress: order.execParams.complicationAddress,
      attributes: token.attributes
    };
    return data;
  }

  private getProtocolFeeBps(): number {
    // todo: should ideally fetch from contract
    return 250;
  }

  private writeOrderItemsToFeed(
    orderItems: (FirestoreOrderItem & { orderItemId: string })[],
    batch: FirebaseFirestore.WriteBatch | FirestoreBatchHandler
  ) {
    const feedCollection = this.firebaseService.firestore.collection(firestoreConstants.FEED_COLL);
    for (const orderItem of orderItems) {
      const usersInvolved = [orderItem.makerAddress, orderItem.takerAddress].filter((address) => !!address);
      const feedEvent: Omit<NftListingEvent, 'isSellOrder' | 'type'> = {
        orderId: orderItem.id,
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
          tokenId: orderItem.tokenId
        }),
        image: orderItem.tokenImage,
        nftName: orderItem.tokenName,
        nftSlug: orderItem.tokenSlug
      };
      let event: NftListingEvent | NftOfferEvent;
      if (orderItem.isSellOrder) {
        event = {
          ...feedEvent,
          type: FeedEventType.NftListing,
          isSellOrder: true
        };
      } else {
        event = {
          ...feedEvent,
          type: FeedEventType.NftOffer,
          isSellOrder: false
        };
      }
      const newDoc = feedCollection.doc();
      if ('add' in batch) {
        batch.add(newDoc, event, { merge: false });
      } else {
        batch.create(newDoc, event);
      }
    }
  }
}
