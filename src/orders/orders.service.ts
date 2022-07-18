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
import { EventType, MultiOrderEvent, OrderBookEvent, OrderItemData } from '@infinityxyz/lib/types/core/feed';
import {
  ChainNFTsDto,
  OrderItemsOrderBy,
  SignedOBOrderArrayDto,
  SignedOBOrderDto,
  SignedOBOrderWithoutMetadataDto,
  UserOrderCollectionsQueryDto,
  UserOrderItemsQueryDto
} from '@infinityxyz/lib/types/dto/orders';
import {
  firestoreConstants,
  getEndCode,
  getInfinityLink,
  getSearchFriendlyString,
  orderHash,
  trimLowerCase
} from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import CollectionsService from 'collections/collections.service';
import { NftsService } from 'collections/nfts/nfts.service';
import { BadQueryError } from 'common/errors/bad-query.error';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';
import { EthereumService } from 'ethereum/ethereum.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { FirestoreDistributedCounter } from 'firebase/firestore-counter';
import { attemptToIndexCollection } from 'utils/collection-indexing';
import { FirebaseService } from '../firebase/firebase.service';
import { CursorService } from '../pagination/cursor.service';
import { ParsedUserId } from '../user/parser/parsed-user-id';
import { UserParserService } from '../user/parser/parser.service';
import { UserService } from '../user/user.service';
import { getDocIdHash } from '../utils';
import { OrderItemTokenMetadata, OrderMetadata } from './order.types';

@Injectable()
export default class OrdersService {
  private numBuyOrderItems: FirestoreDistributedCounter;
  private numSellOrderItems: FirestoreDistributedCounter;
  private openBuyInterest: FirestoreDistributedCounter;
  private openSellInterest: FirestoreDistributedCounter;

  constructor(
    private firebaseService: FirebaseService,
    private userService: UserService,
    private collectionService: CollectionsService,
    private nftsService: NftsService,
    private userParser: UserParserService,
    private ethereumService: EthereumService,
    private cursorService: CursorService
  ) {
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

  private updateOrderCounters(order: SignedOBOrderWithoutMetadataDto) {
    if (order.signedOrder.isSellOrder) {
      this.numSellOrderItems.incrementBy(order.numItems);
      this.openSellInterest.incrementBy(order.startPriceEth);
    } else {
      this.numBuyOrderItems.incrementBy(order.numItems);
      this.openBuyInterest.incrementBy(order.startPriceEth);
    }
  }

  public async createOrder(maker: string, orders: SignedOBOrderWithoutMetadataDto[]): Promise<void> {
    try {
      const fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
      const ordersCollectionRef = this.firebaseService.firestore.collection(firestoreConstants.ORDERS_COLL);
      const makerProfile = await this.userService.getProfileForUserAddress(maker);
      const makerUsername = makerProfile?.username ?? '';

      // fill order with metadata
      const metadata = await this.getOrderMetadata(orders);

      for (const order of orders) {
        // get data
        const orderId = orderHash(order.signedOrder);
        const dataToStore = this.getFirestoreOrderFromSignedOBOrder(maker, makerUsername, order, orderId);
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
        for (const nft of order.signedOrder.nfts) {
          if (nft.tokens.length === 0) {
            // to support any tokens from a collection type orders
            const emptyToken: OrderItemTokenMetadata = {
              tokenId: '',
              numTokens: 1, // default for both ERC721 and ERC1155
              tokenImage:
                metadata?.[order.chainId as ChainId]?.[nft.collection]?.collection?.metadata?.profileImage ?? '',
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
              maker,
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

            orderItems.push({ ...orderItemData, orderItemId: orderItemDocRef.id });
          } else {
            for (const token of nft.tokens) {
              const orderItemMetadata = metadata?.[order.chainId as ChainId]?.[nft.collection];
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

              const orderItemData = await this.getFirestoreOrderItemFromSignedOBOrder(
                order,
                nft,
                orderItemTokenMetadata,
                orderId,
                maker,
                makerUsername,
                collection
              );
              // get doc id
              const tokenId = token.tokenId;
              const orderItemDocRef = orderItemsRef.doc(
                getDocIdHash({ collectionAddress: nft.collection, tokenId, chainId: order.chainId })
              );
              // add to batch
              fsBatchHandler.add(orderItemDocRef, orderItemData, { merge: true });

              orderItems.push({ ...orderItemData, orderItemId: orderItemDocRef.id });
            }
          }
        }

        // write order to feed
        this.writeOrderToFeed(makerUsername, order, orderItems, fsBatchHandler);
      }
      // commit batch
      await fsBatchHandler.flush();
    } catch (err) {
      console.error('Failed to create order(s)', err);
      throw err;
    }
  }

  public async getUserOrderCollections(
    reqQuery: UserOrderCollectionsQueryDto,
    user?: ParsedUserId
  ): Promise<{ data: OBOrderItem[]; hasNextPage: boolean; cursor: string }> {
    let firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      this.firebaseService.firestore.collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL);

    // ordering and pagination
    type Cursor = Record<OrderItemsOrderBy, number>;
    const cursor = this.cursorService.decodeCursorToObject<Cursor>(reqQuery.cursor);

    firestoreQuery = firestoreQuery.where('orderStatus', '==', OBOrderStatus.ValidActive);

    if (user?.userAddress) {
      firestoreQuery = firestoreQuery.where('makerAddress', '==', user.userAddress); // search for orders made by user
    }

    if (reqQuery.collectionName) {
      const startsWith = getSearchFriendlyString(reqQuery.collectionName);
      const endCode = getEndCode(startsWith);

      if (startsWith && endCode) {
        firestoreQuery = firestoreQuery.where('collectionSlug', '>=', startsWith).where('collectionSlug', '<', endCode);
        firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.CollectionSlug, OrderDirection.Ascending);
      }
    } else {
      // default order by startTimeMs desc
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.StartTime, OrderDirection.Descending);
      const startAfterValue = cursor[OrderItemsOrderBy.StartTime];
      if (startAfterValue) {
        firestoreQuery = firestoreQuery.startAfter(startAfterValue);
      }
    }

    // limit
    firestoreQuery = firestoreQuery.limit(reqQuery.limit + 1); // +1 to check if there are more results

    // query firestore
    const data = (await firestoreQuery.get()).docs;

    const hasNextPage = data.length > reqQuery.limit;
    if (hasNextPage) {
      data.pop();
    }

    const lastItem = data[data.length - 1] ?? {};
    const cursorObj: Cursor = {} as Cursor;
    for (const orderBy of Object.values(OrderItemsOrderBy)) {
      cursorObj[orderBy] = lastItem.get(orderBy);
    }
    const nextCursor = this.cursorService.encodeCursor(cursorObj);

    const collections = data.map((doc) => {
      return {
        chainId: doc.get('chainId') as ChainId,
        collectionName: doc.get('collectionName'),
        collectionSlug: doc.get('collectionSlug'),
        collectionAddress: doc.get('collectionAddress'),
        collectionImage: doc.get('collectionImage'),
        hasBlueCheck: doc.get('hasBlueCheck')
      } as OBOrderItem;
    });
    return {
      data: collections,
      cursor: nextCursor,
      hasNextPage
    };
  }

  public async getSignedOBOrders(
    reqQuery: UserOrderItemsQueryDto,
    user?: ParsedUserId
  ): Promise<SignedOBOrderArrayDto> {

    // removed these checks to get offers for any user:
    // if (reqQuery.makerAddress && reqQuery.makerAddress !== user?.userAddress) {
    //   throw new BadQueryError('Maker address must match user address');
    // }

    // if (reqQuery.takerAddress && reqQuery.takerAddress !== user?.userAddress) {
    //   throw new BadQueryError('Taker address must match user address');
    // }

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

    if (reqQuery.id) {
      firestoreQuery = firestoreQuery.where('id', '==', reqQuery.id);
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

    if (reqQuery.tokenId) {
      firestoreQuery = firestoreQuery.where('tokenId', '==', reqQuery.tokenId);
    }

    if (reqQuery.makerAddress) {
      firestoreQuery = firestoreQuery.where('makerAddress', '==', reqQuery.makerAddress);
    }

    if (reqQuery.takerAddress) {
      firestoreQuery = firestoreQuery.where('takerAddress', '==', reqQuery.takerAddress);
    }

    // ordering and pagination
    type Cursor = Record<OrderItemsOrderBy, number>;
    const cursor = this.cursorService.decodeCursorToObject<Cursor>(reqQuery.cursor);
    if (requiresOrderByPrice) {
      const orderDirection = reqQuery.orderByDirection ?? OrderDirection.Ascending;
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.Price, orderDirection);
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.StartTime, OrderDirection.Descending); // to break ties
      // orderedBy = OrderItemsOrderBy.Price;
      const startAfterPrice = cursor[OrderItemsOrderBy.Price];
      const startAfterTime = cursor[OrderItemsOrderBy.StartTime];
      if (startAfterPrice && startAfterTime) {
        firestoreQuery = firestoreQuery.startAfter(startAfterPrice, startAfterTime);
      }
    } else if (reqQuery.orderBy) {
      firestoreQuery = firestoreQuery.orderBy(reqQuery.orderBy, reqQuery.orderByDirection);
      const startAfterValue = cursor[reqQuery.orderBy];
      if (startAfterValue) {
        firestoreQuery = firestoreQuery.startAfter(startAfterValue);
      }
    } else {
      // default order by startTimeMs desc
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.StartTime, OrderDirection.Descending);
      const startAfterValue = cursor[OrderItemsOrderBy.StartTime];
      if (startAfterValue) {
        firestoreQuery = firestoreQuery.startAfter(startAfterValue);
      }
    }

    // limit
    firestoreQuery = firestoreQuery.limit(reqQuery.limit + 1); // +1 to check if there are more results

    // query firestore
    const data = await this.getOrders(firestoreQuery);

    const hasNextPage = data.length > reqQuery.limit;
    if (hasNextPage) {
      data.pop();
    }

    const lastItem = data[data.length - 1] ?? {};
    const cursorObj: Cursor = {} as Cursor;
    for (const orderBy of Object.values(OrderItemsOrderBy)) {
      if (orderBy !== OrderItemsOrderBy.CollectionSlug) {
        cursorObj[orderBy] = lastItem[orderBy];
      }
    }
    const nextCursor = this.cursorService.encodeCursor(cursorObj);

    return {
      data,
      cursor: nextCursor,
      hasNextPage
    };
  }

  private async getOrderMetadata(orders: SignedOBOrderWithoutMetadataDto[]): Promise<OrderMetadata> {
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
        if (nft.tokens.length === 0) {
          tokensByCollection.add('');
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
        if (!collection?.state?.create?.step || collection?.state?.create?.step === CreationFlow.CollectionMetadata) {
          // initiate indexing
          if (collection?.address && collection?.chainId) {
            attemptToIndexCollection({ collectionAddress: collection?.address, chainId: collection?.chainId }).catch(
              (err) => console.error(err)
            );
          }

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

  public async getOrders(
    firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>
  ): Promise<SignedOBOrderDto[]> {
    // fetch query snapshot
    const firestoreOrderItems = await firestoreQuery.get();
    const obOrderItemMap: { [key: string]: { [key: string]: OBOrderItem } } = {};
    const resultsMap: { [key: string]: SignedOBOrderDto } = {};

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
            chainId: orderItemData.chainId as ChainId,
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
          chainId: orderItemData.chainId as ChainId,
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
        maxGasPriceWei: orderDocData.maxGasPriceWei,
        nonce: orderDocData.nonce,
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
      resultsMap[orderDocId] = signedOBOrder;
    }

    return Object.values(resultsMap);
  }

  public async getOrderNonce(userId: string): Promise<number> {
    try {
      const user = trimLowerCase(userId);
      const userDocRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(user);
      const updatedNonce = await this.firebaseService.firestore.runTransaction(async (t) => {
        const userDoc = await t.get(userDocRef);
        // todo: use a user dto or type?
        const userDocData = userDoc.data() || { address: user };
        const nonce = parseInt(userDocData.orderNonce ?? 0) + 1;
        const minOrderNonce = parseInt(userDocData.minOrderNonce ?? 0) + 1;
        const newNonce = nonce > minOrderNonce ? nonce : minOrderNonce;
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
    order: SignedOBOrderWithoutMetadataDto,
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
        maxGasPriceWei: order.maxGasPriceWei,
        nonce: order.nonce,
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
    order: SignedOBOrderWithoutMetadataDto,
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

  private writeOrderToFeed(
    makerUsername: string,
    order: SignedOBOrderWithoutMetadataDto,
    orderItems: (FirestoreOrderItem & { orderItemId: string })[],
    batchHandler: FirestoreBatchHandler
  ) {
    // multi/any order type
    if (orderItems.length === 0 || orderItems.length > 1) {
      this.writeMultiOrderToFeed(makerUsername, order, orderItems, batchHandler);
    } else {
      this.writeSingleOrderToFeed(makerUsername, order, orderItems[0], batchHandler);
    }
  }

  private writeSingleOrderToFeed(
    makerUsername: string,
    order: SignedOBOrderWithoutMetadataDto,
    orderItem: FirestoreOrderItem & { orderItemId: string },
    batchHandler: FirestoreBatchHandler
  ) {
    const feedCollection = this.firebaseService.firestore.collection(firestoreConstants.FEED_COLL);
    const usersInvolved = [orderItem.makerAddress, orderItem.takerAddress].filter((address) => !!address);
    const feedEvent: OrderBookEvent = {
      orderId: orderItem.id,
      isSellOrder: order.signedOrder.isSellOrder,
      type: order.signedOrder.isSellOrder ? EventType.NftListing : EventType.NftOffer,
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
    makerUsername: string,
    order: SignedOBOrderWithoutMetadataDto,
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
      orderId: order.id,
      chainId: order.chainId,
      isSellOrder: order.signedOrder.isSellOrder,
      paymentToken: order.execParams.currencyAddress,
      quantity: order.numItems,
      startPriceEth: order.startPriceEth,
      endPriceEth: order.endPriceEth,
      startTimeMs: order.startTimeMs,
      endTimeMs: order.endTimeMs,
      makerAddress: order.signedOrder.signer,
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
