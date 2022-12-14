import { ChainId, OrderCreatedEvent, OrderEventKind } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { ChainOBOrderHelper } from 'orders/chain-ob-order-helper';
import { NonceService } from './nonce/nonce.service';

@Injectable()
export class BaseOrdersService extends NonceService {
  constructor(
    firebaseService: FirebaseService,
    contractService: ContractService,
    protected _ethereumService: EthereumService
  ) {
    super(firebaseService, contractService);
  }

  public async createOrders(chainId: ChainId, orders: ChainOBOrderHelper[]): Promise<void> {
    const maker = orders[0]?.signer;

    const sameMaker = orders.every((item) => item.signer === maker);
    if (!sameMaker) {
      throw new Error('All orders must have the same maker');
    }

    for (const order of orders) {
      if (order.startPrice !== order.endPrice) {
        throw new Error('Dynamic orders are not currently supported'); // TODO support dynamic orders
      }

      if (order.numItems !== 1) {
        throw new Error('Bundles are not yet supported'); // TODO support bundles
      }

      if (order.kind === 'complex') {
        /**
         * TODO support more than single token and contract-wide orders
         */
        throw new Error('Complex order types are not yet supported');
      }

      const isSigValid = order.isSigValid();
      if (!isSigValid) {
        throw new Error('Invalid signature');
      }
      try {
        order.checkValidity();
      } catch (err) {
        throw new Error('Invalid order');
      }

      try {
        await order.checkFillability(this._ethereumService.getProvider(chainId));
      } catch (err) {
        if (err instanceof Error) {
          switch (err.message) {
            case 'not-fillable':
              throw new Error('Order is not fillable. Invalid currency or nonce');
            case 'no-balance':
              throw new Error('Order is not fillable. Insufficient balance');
            case 'no-approval':
              throw new Error('Order is not fillable. Approvals have not been set');
            default:
              console.error(err);
              throw new Error('Order is not fillable. Unknown error');
          }
        }
      }
    }

    for (const order of orders) {
      await this.claimNonce(order.signer, chainId, order.nonce);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const refs = await this._saveOrders(chainId, orders);
    // TODO - should we wait for the events to be processed before returning?
  }

  private async _saveOrders(chainId: ChainId, orders: ChainOBOrderHelper[]) {
    const batch = new FirestoreBatchHandler(this._firebaseService);

    const events = this._getOrderCreatedEvents(chainId, orders);
    for (const { ref, event } of events) {
      await batch.createAsync(ref, event);
    }

    await batch.flush();

    return events.map((item) => item.ref);
  }

  private _getOrderCreatedEvents(chainId: ChainId, orders: ChainOBOrderHelper[]) {
    return orders.map((item) => {
      const orderId = item.hash();
      const ref = this._firebaseService.firestore
        .collection(firestoreConstants.ORDERS_V2_COLL)
        .doc(orderId)
        .collection(firestoreConstants.ORDER_EVENTS_COLL)
        .doc() as FirebaseFirestore.DocumentReference<OrderCreatedEvent>;
      const event: OrderCreatedEvent = {
        metadata: {
          id: ref.id,
          isSellOrder: item.isSellOrder,
          orderId,
          chainId,
          processed: false,
          migrationId: 1,
          eventKind: OrderEventKind.Created,
          timestamp: Date.now(),
          updatedAt: Date.now(),
          eventSource: 'infinity-orderbook'
        },
        data: {
          isNative: true,
          status: 'active',
          order: {
            id: orderId,
            chainId,
            updatedAt: Date.now(),
            isSellOrder: item.isSellOrder,
            createdAt: Date.now(),
            source: 'infinity',
            rawOrder: item.getSignedOrder(),
            infinityOrderId: orderId,
            infinityOrder: item.getSignedOrder(),
            gasUsage: '0',
            isDynamic: item.startPrice === item.endPrice
          }
        }
      };

      return { ref, event };
    });
  }
}
