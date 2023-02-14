import {
  ChainId,
  ChainOBOrder,
  OrderCreatedEvent,
  OrderEventKind,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { BaseOrdersService } from 'v2/orders/base-orders.service';
import { BulkOrderQuery } from 'v2/orders/bulk-query';
import { CursorService } from 'pagination/cursor.service';
import { PassThrough } from 'stream';
import { streamQueryPageWithRef } from 'firebase/stream-query';
import { OrderbookSnapshotOrder } from 'v2/bulk/types';
import { BigNumber } from 'ethers';
import PQueue from 'p-queue';

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
       * it is important we only return signed flow orders
       *
       * this should also guarantee that we receive orders
       * without errors
       */
      .where('data.order.source', '==', 'flow')
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

  public async takeSnapshot(chainId: ChainId, bucketName: string, fileName: string) {
    const file = this._firebaseService.getBucket(bucketName).file(fileName);

    const startTimestamp = Date.now();

    console.log(`Starting snapshot for chainId: ${chainId}`);

    const passthroughStream = new PassThrough();

    const activeOrdersQuery = this._firebaseService.firestore
      .collection(firestoreConstants.ORDERS_V2_COLL)
      .where('metadata.chainId', '==', chainId)
      .where('order.status', '==', 'active') as FirebaseFirestore.Query<RawFirestoreOrderWithoutError>;

    const splitQuery = (max: BigNumber, num: number) => {
      const queries = [];
      const len = max.toHexString().length;
      for (let i = 0; i < num; i++) {
        const start = max.mul(i).div(num).toHexString().padEnd(len, '0');
        const end = max
          .mul(i + 1)
          .div(num)
          .toHexString();

        queries.push(activeOrdersQuery.where('__name__', '>=', start).where('__name__', '<=', end));
      }

      return queries;
    };

    const concurrency = 8;

    const queries = splitQuery(
      BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
      concurrency
    );

    const queue = new PQueue({ concurrency });

    let numOrders = 0;
    let error: { value: Error | null; didError: boolean } = { value: null, didError: false };

    const uploadPromise = new Promise<void>((resolve, reject) => {
      passthroughStream
        .pipe(file.createWriteStream())
        .on('finish', () => {
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        });
    }).catch((err) => {
      error = { value: err, didError: true };
    });

    const start = Date.now();

    for (const query of queries) {
      queue
        .add(async () => {
          const streamOrders = async (passThough: PassThrough) => {
            const stream = streamQueryPageWithRef(query);

            for await (const page of stream) {
              const chunk = page.map((item) => {
                const orderData: OrderbookSnapshotOrder = {
                  id: item.data.metadata.id,
                  order: item.data.rawOrder.infinityOrder,
                  source: item.data.order.sourceMarketplace,
                  sourceOrder: item.data.rawOrder.rawOrder,
                  gasUsage: item.data.rawOrder.gasUsage
                };
                return JSON.stringify(orderData);
              });
              passThough.write(chunk.join('\n') + '\n');
              numOrders += chunk.length;
              const rate = Math.floor(numOrders / ((Date.now() - start) / 1000));
              console.log(`Snapshot - Handled ${numOrders} orders so far at ${rate} orders/sec`);
            }
          };

          await streamOrders(passthroughStream);
        })
        .catch((err) => {
          console.error(err);
          error = {
            value: err as Error,
            didError: true
          };
        });
    }

    await queue.onIdle();
    passthroughStream.end();

    await uploadPromise;

    if (error.didError) {
      console.error(`Failed to take snapshot for chainId: ${chainId}`, error.value);
      throw error.value;
    }

    const metadata = {
      bucket: bucketName,
      file: fileName,
      chainId: chainId,
      numOrders: numOrders,
      timestamp: startTimestamp
    };

    await this._firebaseService.firestore.collection('orderSnapshots').doc(fileName).set(metadata);

    console.log(`Snapshot - Uploaded ${numOrders} orders to ${fileName}`);
  }
}
