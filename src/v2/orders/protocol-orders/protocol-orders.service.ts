import { ChainOBOrder, OrderCreatedEvent, OrderEventKind, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { BaseOrdersService } from 'v2/orders/base-orders.service';
import { BulkOrderQuery } from 'v2/orders/bulk-query';
import { CursorService } from 'pagination/cursor.service';

export type ProtocolOrder = {
  id: string;
  chainId: string;
  updatedAt: number;
  isSellOrder: boolean;
  createdAt: number;
  signedOrder: ChainOBOrder;
};

@Injectable()
export class ProtocolOrdersService extends BaseOrdersService {
  constructor(
    firebaseService: FirebaseService,
    contractService: ContractService,
    ethereumService: EthereumService,
    protected _cursorService: CursorService
  ) {
    super(firebaseService, contractService, ethereumService);
  }

  async getBulkOrders(query: BulkOrderQuery): Promise<{ cursor: string; hasMore: boolean; data: ProtocolOrder[] }> {
    const orderSide = query.side;

    const createdAfter = query.createdAfter ?? 0;
    const createdBefore = query.createdBefore ?? Date.now();

    type Cursor = {
      timestamp: number;
      id: string;
    };
    const cursor = this._cursorService.decodeCursorToObject<Cursor>(query.cursor);

    let orderEventsRef = this._firebaseService.firestore
      .collectionGroup('orderEvents')
      .where('metadata.eventKind', '==', OrderEventKind.Created)
      .where('metadata.chainId', '==', query.chainId)
      .where('metadata.isSellOrder', '==', orderSide === 'sell')
      /**
       * it is important we only return signed infinity orders
       *
       * this should also guarantee that we receive orders
       * without errors
       */
      .where('data.order.source', '==', 'infinity') // TODO update to flow
      .where('metadata.timestamp', '>=', createdAfter)
      .where('metadata.timestamp', '<=', createdBefore)
      .orderBy('metadata.timestamp', query.orderDirection)
      .orderBy('metadata.orderId', query.orderDirection) as FirebaseFirestore.Query<OrderCreatedEvent>;

    if ('timestamp' in cursor && 'id' in cursor) {
      orderEventsRef = orderEventsRef.startAfter(cursor.timestamp, cursor.id);
    }

    const orderEvents = await orderEventsRef.limit(query.limit + 1).get();

    const hasMore = orderEvents.size > query.limit;

    if (hasMore) {
      orderEvents.docs.pop();
    }

    const results: ProtocolOrder[] = orderEvents.docs.map((snap) => {
      const data = snap.data();

      if (!('rawOrder' in data.data.order) || !data.data.order.rawOrder) {
        throw new Error('Expected to find order');
      }

      return {
        id: data.metadata.orderId,
        chainId: data.metadata.chainId,
        updatedAt: data.metadata.updatedAt,
        isSellOrder: data.metadata.isSellOrder,
        createdAt: data.metadata.timestamp,
        signedOrder: data.data.order.rawOrder as ChainOBOrder
      };
    });

    const lastItem = results[results.length - 1];

    if (!lastItem) {
      return {
        cursor: query.cursor ?? '',
        hasMore: false,
        data: [] as ProtocolOrder[]
      };
    }

    const newCursor = this._cursorService.encodeCursor({
      timestamp: lastItem.createdAt,
      id: lastItem.id
    });

    return {
      hasMore,
      cursor: newCursor,
      data: results
    };
  }

  public async getOrderById(id: string) {
    const ref = this._firebaseService.firestore
      .collection(firestoreConstants.ORDERS_V2_COLL)
      .doc(id) as FirebaseFirestore.DocumentReference<RawFirestoreOrder>;

    const orderSnap = await ref.get();

    if (!orderSnap.exists) {
      return null;
    }

    const order = orderSnap.data();

    if (!order || !('rawOrder' in order) || !order.rawOrder) {
      return null;
    }

    if ('error' in order.rawOrder) {
      return null;
    }

    return order.rawOrder;
  }
}
