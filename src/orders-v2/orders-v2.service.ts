import { ChainId, FirestoreDisplayOrderWithoutError, OrderDirection, Order } from '@infinityxyz/lib/types/core';
import { firestoreConstants, formatEth, getOBOrderPrice } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { bn } from 'utils';
import { BaseOrdersService } from './base-orders.service';
import { BaseOrderQuery, OrderBy, OrderQueries } from './query';

@Injectable()
export class OrdersV2Service extends BaseOrdersService {
  constructor(
    firebaseService: FirebaseService,
    contractService: ContractService,
    ethereumService: EthereumService,
    protected cursorService: CursorService
  ) {
    super(firebaseService, contractService, ethereumService);
  }

  public async getDisplayOrders(chainId: ChainId, query: OrderQueries, collection: string, tokenId?: string) {
    let ref;
    if (tokenId) {
      ref = this._firebaseService.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${collection}`)
        .collection('nfts')
        .doc(`${tokenId}`)
        .collection(
          firestoreConstants.TOKEN_ORDERS_COLL
        ) as FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>;
    } else {
      ref = this._firebaseService.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${collection}`)
        .collection(
          firestoreConstants.COLLECTION_ORDERS_COLL
        ) as FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>;
    }
    return this.getOrders(chainId, query, ref);
  }

  public async transformDisplayOrders(chainId: ChainId, displayOrders: FirestoreDisplayOrderWithoutError[]) {
    const gasPrice = await this._ethereumService.getGasPrice(chainId);
    console.log(`Current Gas Price: ${gasPrice.baseFeeGwei} gwei`);
    return displayOrders.map((item: FirestoreDisplayOrderWithoutError) => {
      let startPriceWei = bn(item.order.startPrice);
      let endPriceWei = bn(item.order.endPrice);

      // TODO update gas estimates once we have a better idea of how much gas is used
      if (item.metadata.source !== 'infinity') {
        const gasToFulfillOnExternal = item.order.gasUsage;
        const buffer = 100_000;
        const totalGas = gasToFulfillOnExternal + buffer;

        const gasFeesWei = bn(gasPrice.baseFee).mul(totalGas);

        console.log(`Non-native order gas usage: ${totalGas}`);
        console.log(`Gas cost: ${formatEth(gasFeesWei.toString())}`);

        startPriceWei = startPriceWei.add(gasFeesWei);
        endPriceWei = endPriceWei.add(gasFeesWei);
      }

      const startPriceEth = formatEth(startPriceWei.toString(), 6);
      const endPriceEth = formatEth(endPriceWei.toString(), 6);

      const currentPriceWei = getOBOrderPrice(
        {
          startTimeMs: item.order.startTimeMs,
          endTimeMs: item.order.endTimeMs,
          startPriceEth,
          endPriceEth
        },
        Date.now()
      );

      const currentPriceEth = formatEth(currentPriceWei.toString(), 6);
      console.log(`Current Price: ${currentPriceEth} ETH`);

      const startPricePerItemEth = formatEth(startPriceWei.div(item.order.numItems).toString(), 6);
      const endPricePerItemEth = formatEth(endPriceWei.div(item.order.numItems).toString(), 6);

      const displayData = item.displayOrder;
      const data: Order = {
        id: item.metadata.id,
        chainId: item.metadata.chainId,
        createdAt: item.metadata.createdAt,
        startTimeMs: item.order.startTimeMs,
        endTimeMs: item.order.endTimeMs,
        currentPriceEth,
        isPrivate: false, // TODO handle private orders
        numItems: item.order.numItems,
        currency: item.order.currency,
        startPriceEth,
        endPriceEth,
        startPricePerItemEth,
        endPricePerItemEth,
        hasBlueCheck: item.order.hasBlueCheck,
        numTokens: item.order.orderKind.numTokens,
        numCollections: item.order.orderKind.numCollections,
        isSubSetOrder: item.order.orderKind.isSubSetOrder,
        isDynamic: item.order.orderKind.isDynamic,
        status: item.order.status,
        ...displayData
      };

      return data;
    });
  }

  protected async getOrders(
    chainId: ChainId,
    query: BaseOrderQuery,
    ref: FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>
  ) {
    type Cursor = {
      startPrice: number;
      startTime: number;
      endTime: number;
      id: string;
    };
    const filterBySellOrder = query.isSellOrder != null;
    const filterByStatus = query.status != null;

    const DEFAULT_ORDER_BY = OrderBy.StartTime;
    const DEFAULT_ORDER_DIRECTION = OrderDirection.Descending;

    const orderBy = query.orderBy ? query.orderBy : DEFAULT_ORDER_BY;
    const maxPrice = query.maxPrice ? query.maxPrice : Number.MAX_SAFE_INTEGER;
    const minPrice = query.minPrice ? query.minPrice : 0;
    if ((orderBy !== OrderBy.Price && query.maxPrice) || query.minPrice) {
      throw new Error('maxPrice and minPrice can only be used when orderBy is set to price');
    }

    const orderDirection = query.orderDirection ? query.orderDirection : DEFAULT_ORDER_DIRECTION;
    const limit = query.limit ?? 50;
    const cursor = this.cursorService.decodeCursorToObject<Cursor>(query.cursor);

    let firestoreQuery: FirebaseFirestore.Query<FirestoreDisplayOrderWithoutError> = ref.where(
      'metadata.chainId',
      '==',
      chainId
    );

    if (filterBySellOrder) {
      firestoreQuery = firestoreQuery.where('order.isSellOrder', '==', query.isSellOrder);
    }

    if (filterByStatus) {
      firestoreQuery = firestoreQuery.where('order.status', '==', query.status);
    }

    switch (orderBy) {
      case OrderBy.Price: {
        firestoreQuery = firestoreQuery
          .where('order.startPriceEth', '>=', minPrice)
          .where('order.startPriceEth', '<=', maxPrice)
          .orderBy('order.startPriceEth', orderDirection)
          .orderBy('metadata.id', orderDirection);
        if (cursor.id && cursor.startPrice) {
          firestoreQuery = firestoreQuery.startAfter([cursor.startPrice, cursor.id]);
        }
        break;
      }
      case OrderBy.StartTime: {
        firestoreQuery = firestoreQuery
          .orderBy('order.startTimeMs', orderDirection)
          .orderBy('metadata.id', orderDirection);
        if (cursor.id && cursor.startTime) {
          firestoreQuery = firestoreQuery.startAfter([cursor.startTime, cursor.id]);
        }
        break;
      }
      case OrderBy.EndTime: {
        firestoreQuery = firestoreQuery
          .orderBy('order.endTimeMs', orderDirection)
          .orderBy('metadata.id', orderDirection);
        if (cursor.id && cursor.endTime) {
          firestoreQuery = firestoreQuery.startAfter([cursor.endTime, cursor.id]);
        }
        break;
      }
    }

    const snap = await firestoreQuery.limit(limit + 1).get();

    const orders = snap.docs.map((item) => item.data());

    const hasNextPage = orders.length > limit;

    if (hasNextPage) {
      orders.pop();
    }

    const lastOrder = orders[orders.length - 1];

    const newCursor: Cursor = {
      startPrice: lastOrder.order.startPriceEth,
      startTime: lastOrder.order.startTimeMs,
      endTime: lastOrder.order.endTimeMs,
      id: lastOrder.metadata.id
    };

    const encodedCursor = this.cursorService.encodeCursor(newCursor);
    const transformed = await this.transformDisplayOrders(chainId, orders);
    return {
      data: transformed,
      cursor: encodedCursor,
      hasNextPage
    };
  }
}
