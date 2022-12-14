import {
  ChainId,
  FirestoreOrder,
  FirestoreOrderItem,
  OBOrderItem,
  OBOrderStatus,
  OBTokenInfo,
  OrderDirection
} from '@infinityxyz/lib/types/core';
import {
  UserOrderItemsQueryDto,
  SignedOBOrderArrayDto,
  OrderItemsOrderBy,
  SignedOBOrderDto
} from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { BadQueryError } from 'common/errors/bad-query.error';
import { ContractService } from 'ethereum/contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { NonceService } from 'v2/orders/nonce/nonce.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class BaseOrdersService extends NonceService {
  constructor(
    protected firebaseService: FirebaseService,
    contractService: ContractService,
    protected cursorService: CursorService
  ) {
    super(firebaseService, contractService);
  }

  public async getSignedOBOrders(
    reqQuery: UserOrderItemsQueryDto,
    user?: ParsedUserId
  ): Promise<SignedOBOrderArrayDto> {
    if (reqQuery.makerAddress && reqQuery.makerAddress !== user?.userAddress) {
      throw new BadQueryError('Maker address must match user address');
    }

    if (reqQuery.takerAddress && reqQuery.takerAddress !== user?.userAddress) {
      throw new BadQueryError('Taker address must match user address');
    }

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
    const firestoreOrderItems = await firestoreQuery.get();
    const data = await this.getOrders(firestoreOrderItems);

    const hasNextPage = firestoreOrderItems.size > reqQuery.limit;
    if (hasNextPage) {
      if (data.length > reqQuery.limit) {
        data.pop();
      }
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

  private async getOrders(
    firestoreOrderItems: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ): Promise<SignedOBOrderDto[]> {
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
            tokens: token.tokenId ? [token] : []
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
          tokens: token.tokenId ? [token] : []
        };
        obOrderItemMap[orderItemData.id] = { [orderItemData.collectionAddress]: obOrderItem };
      }
      const signedOBOrder: SignedOBOrderDto = {
        id: orderDocData.id,
        chainId: orderDocData.chainId,
        isSellOrder: orderDocData.isSellOrder,
        numItems: orderDocData.numItems,
        startPriceEth: orderDocData.startPriceEth,
        endPriceEth: orderDocData.endPriceEth,
        startTimeMs: orderDocData.startTimeMs,
        endTimeMs: orderDocData.endTimeMs,
        maxGasPriceWei: orderDocData.maxGasPriceWei,
        nonce: orderDocData.nonce,
        makerAddress: orderDocData.makerAddress,
        makerUsername: orderDocData.makerUsername,
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
    const orderItems = new Map<string, { orderDocId: string; orderItem: FirestoreOrderItem }>();
    for (const orderItem of firestoreOrderItems.docs) {
      const orderItemData = orderItem.data() as FirestoreOrderItem;
      const orderDocId = orderItem.ref.parent.parent?.id;
      if (orderDocId) {
        orderDocsToGet[orderDocId] = orderItem.ref.parent.parent;
        orderItems.set(orderItem.id, { orderDocId, orderItem: orderItemData });
      }
    }

    const docRefs = Object.values(orderDocsToGet);
    if (docRefs.length === 0) {
      return [];
    }

    const orderDocs = await this.firebaseService.firestore.getAll(...docRefs);
    const orderDocsById: { [key: string]: FirestoreOrder } = {};
    for (const doc of orderDocs) {
      orderDocsById[doc.id] = doc.data() as FirestoreOrder;
    }

    // get all other orderItems for orders
    for (const docId in orderDocsById) {
      const otherOrderItems = this.firebaseService.firestore
        .collection(firestoreConstants.ORDERS_COLL)
        .doc(docId)
        .collection(firestoreConstants.ORDER_ITEMS_SUB_COLL);
      const otherOrderItemsSnapshot = await otherOrderItems.get();
      for (const otherOrderItemDoc of otherOrderItemsSnapshot.docs) {
        orderItems.set(otherOrderItemDoc.id, {
          orderItem: otherOrderItemDoc.data() as FirestoreOrderItem,
          orderDocId: docId
        });
      }
    }

    for (const { orderDocId, orderItem } of orderItems.values()) {
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
}
