import {
  ChainId,
  Erc721Token,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  Order,
  OrderDirection
} from '@infinityxyz/lib/types/core';
import { OrderBy, OrderQueries, Side } from '@infinityxyz/lib/types/dto';
import {
  PROTOCOL_FEE_BPS,
  firestoreConstants,
  formatEth,
  getCollectionDocId,
  getOBOrderPrice,
  trimLowerCase
} from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { ReservoirTokenV6, ReservoirUserTopOffers } from 'reservoir/types';
import { bn } from 'utils';
import { MatchingEngineService } from 'v2/matching-engine/matching-engine.service';
import { DEFAULT_MIN_XFL_BALANCE_FOR_ZERO_FEE } from '../../constants';
import { BaseOrdersService } from './base-orders.service';
import { AggregatedOrder } from './types';

@Injectable()
export class OrdersService extends BaseOrdersService {
  constructor(
    firebaseService: FirebaseService,
    contractService: ContractService,
    ethereumService: EthereumService,
    protected reservoirService: ReservoirService,
    protected cursorService: CursorService,
    protected matchingEngineService: MatchingEngineService
  ) {
    super(firebaseService, contractService, ethereumService);
  }

  public async getMinXflBalanceForZeroFees(chainId: string, collection: string, user: string): Promise<number> {
    const defaultFeeDoc = await this._firebaseService.firestore.collection('platformFees').doc('default').get();
    let fees = defaultFeeDoc.data()?.minXflBalanceForZeroFee ?? DEFAULT_MIN_XFL_BALANCE_FOR_ZERO_FEE;

    // check if fees are waived for this user
    if (user) {
      const userDoc = await this._firebaseService.firestore.collection('platformFees').doc(trimLowerCase(user)).get();
      if (userDoc.exists) {
        fees = userDoc.data()?.minXflBalanceForZeroFee ?? fees;
      }
    }

    // check if fees are waived for this collection
    if (chainId && collection) {
      const collDocId = getCollectionDocId({ chainId, collectionAddress: collection });
      const platformFeesDoc = await this._firebaseService.firestore.collection('platformFees').doc(collDocId).get();
      if (platformFeesDoc.exists) {
        fees = platformFeesDoc.data()?.minXflBalanceForZeroFee ?? fees;
      }
    }

    return fees;
  }

  public async getBestAskBidForToken(
    chainId: string,
    collection: string,
    tokenId: string
  ): Promise<ReservoirTokenV6 | undefined> {
    const data = await this.reservoirService.getSingleTokenInfo(chainId, collection, tokenId);
    if (!data) {
      return undefined;
    }
    const token = data.tokens[0];
    const tokenWithChainId = { ...token, chainId };
    return tokenWithChainId;
  }

  public async getAggregatedOrders(
    chainId: string,
    collection: string,
    tokenId?: string,
    continuation?: string,
    user?: string,
    side?: string,
    collBidsOnly?: boolean
  ): Promise<{ continuation: string | undefined; orders: AggregatedOrder[] | undefined }> {
    const orders = await this.reservoirService.getOrders(
      chainId,
      collection,
      tokenId,
      continuation,
      user,
      side,
      collBidsOnly
    );
    if (!orders) {
      return {
        continuation: undefined,
        orders: undefined
      };
    }

    let augmentedOrders = orders.orders.map((order) => {
      const lastSalePriceEth = 0;
      const mintPriceEth = 0;
      return {
        ...order,
        chainId,
        lastSalePriceEth,
        mintPriceEth
      };
    });

    if (!collBidsOnly) {
      // fetch last sale price from firestore
      const collsRef = this._firebaseService.firestore.collection(firestoreConstants.COLLECTIONS_COLL);
      const ordersWithTokenIds = orders.orders.filter((order) => order.criteria?.data?.token?.tokenId);
      if (ordersWithTokenIds.length > 0) {
        const nftRefs = ordersWithTokenIds.map((order) =>
          collsRef
            .doc(getCollectionDocId({ collectionAddress: order.contract, chainId }))
            .collection('nfts')
            .doc(order.criteria.data.token.tokenId)
        );
        const nftsSnap = await this._firebaseService.firestore.getAll(...nftRefs);
        const nfts = nftsSnap.map((snap) => snap.data() as Erc721Token);

        augmentedOrders = orders.orders.map((order) => {
          const nft = nfts.find((nft) => nft?.tokenId === order.criteria?.data?.token?.tokenId);
          const lastSalePriceEth = nft?.lastSalePriceEth ?? 0;
          const mintPriceEth = nft?.mintPrice ?? 0;
          return {
            ...order,
            chainId,
            lastSalePriceEth,
            mintPriceEth
          };
        });
      }
    }

    return {
      continuation: orders.continuation,
      orders: augmentedOrders
    };
  }

  public async getUserTopOffers(
    chainId: string,
    user: string,
    collection?: string,
    continuation?: string
  ): Promise<ReservoirUserTopOffers | undefined> {
    const offers = await this.reservoirService.getUserTopOffers(chainId, user, collection, continuation);
    if (!offers) {
      return undefined;
    }

    const offersWithChainId = offers.topBids.map((offer) => ({ ...offer, chainId }));
    offers.topBids = offersWithChainId;

    return offers;
  }

  public getGasCostWei(
    isNative: boolean,
    gasPrice: {
      baseFee: string;
      baseFeeGwei: string;
      maxBaseFeeWei: string;
      minBaseFeeWei: string;
      maxBaseFeeGwei: string;
      minBaseFeeGwei: string;
    },
    gasUsage?: string
  ) {
    // if (isNative) {
    //   return '0';
    // }
    const gasToFulfillOnExternal = gasUsage ?? '400000';
    const buffer = 100_000;
    const totalGas = BigNumber.from(gasToFulfillOnExternal).add(buffer);
    const priorityFee = parseUnits('3', 'gwei');
    const gasFeesWei = bn(gasPrice.maxBaseFeeWei).add(priorityFee).mul(totalGas);
    return gasFeesWei;
  }

  public async getDisplayOrders(
    chainId: ChainId,
    query: OrderQueries,
    asset: { collection: string } | { collection: string; tokenId: string } | { user: string }
  ) {
    // joe-todo: filter out infinity orders
    let ref:
      | FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>
      | FirebaseFirestore.CollectionGroup<FirestoreDisplayOrderWithoutError>;
    if ('tokenId' in asset) {
      ref = this._firebaseService.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${asset.collection}`)
        .collection('nfts')
        .doc(`${asset.tokenId}`)
        .collection(
          firestoreConstants.TOKEN_ORDERS_COLL
        ) as FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>;
    } else if ('collection' in asset) {
      ref = this._firebaseService.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${asset.collection}`)
        .collection(
          firestoreConstants.COLLECTION_ORDERS_COLL
        ) as FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>;
    } else if ('user' in asset && 'side' in query) {
      if (query.side === Side.Maker) {
        ref = this._firebaseService.firestore
          .collection('users')
          .doc(asset.user)
          .collection(
            firestoreConstants.MAKER_ORDERS_COLL
          ) as FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>;
      } else {
        ref = this._firebaseService.firestore
          .collectionGroup(firestoreConstants.TOKEN_ORDERS_COLL)
          .where(
            'order.owners',
            'array-contains',
            asset.user
          ) as FirebaseFirestore.CollectionGroup<FirestoreDisplayOrderWithoutError>;
      }
    } else {
      throw new Error('Invalid asset');
    }
    // joe-todo: improve price filtering to work over the calculated prices
    return this._getOrders(chainId, query, ref);
  }

  public transformDisplayOrders(
    gasPrice: {
      baseFee: string;
      baseFeeGwei: string;
      maxBaseFeeWei: string;
      minBaseFeeWei: string;
      maxBaseFeeGwei: string;
      minBaseFeeGwei: string;
    },
    displayOrders: FirestoreDisplayOrderWithoutError[]
  ) {
    return displayOrders.map((item: FirestoreDisplayOrderWithoutError) => {
      let startPriceWei = bn(item.order.startPrice);
      let endPriceWei = bn(item.order.endPrice);

      // joe-todo: update gas estimates once we have a better idea of how much gas is used
      // const isNative = item.metadata.source === 'flow';
      // const gasCostWei = this.getGasCostWei(isNative, gasPrice, item.order.gasUsageString);

      if (item.metadata.source !== 'flow') {
        const startPriceFees = startPriceWei.mul(PROTOCOL_FEE_BPS).div(10_000);
        const endPriceFees = endPriceWei.mul(PROTOCOL_FEE_BPS).div(10_000);
        startPriceWei = startPriceWei.add(startPriceFees);
        endPriceWei = endPriceWei.add(endPriceFees);
      }
      // startPriceWei = startPriceWei.add(gasCostWei);
      // endPriceWei = endPriceWei.add(gasCostWei);

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

      const startPricePerItemEth = formatEth(startPriceWei.div(item.order.numItems).toString(), 6);
      const endPricePerItemEth = formatEth(endPriceWei.div(item.order.numItems).toString(), 6);

      const displayData = item.displayOrder;
      const data: Order = {
        id: item.metadata.id,
        chainId: item.metadata.chainId,
        createdAt: item.metadata.createdAt,
        isSellOrder: item.order.isSellOrder,
        startTimeMs: item.order.startTimeMs,
        endTimeMs: item.order.endTimeMs,
        currentPriceEth,
        isPrivate: false, // future-todo: handle private orders
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
        nonce: item.order.nonce,
        ...displayData
      };

      return data;
    });
  }

  protected async _getOrders(
    chainId: ChainId,
    query: OrderQueries,
    ref:
      | FirebaseFirestore.CollectionReference<FirestoreDisplayOrderWithoutError>
      | FirebaseFirestore.CollectionGroup<FirestoreDisplayOrderWithoutError>
  ) {
    type Cursor = {
      startPrice: number;
      startTime: number;
      endTime: number;
      id: string;
    };

    const filterBySellOrder = query.isSellOrder != null;
    const filterByStatus = query.status != null;
    const filterByCollection = 'collection' in query && query.collection != null;
    const filterByCollectionWide = 'onlyCollectionWide' in query && query.onlyCollectionWide === true;

    const DEFAULT_ORDER_BY = OrderBy.StartTime;
    const DEFAULT_ORDER_DIRECTION = OrderDirection.Descending;

    const orderBy = query.orderBy ? query.orderBy : DEFAULT_ORDER_BY;
    const maxPrice = query.maxPrice ? query.maxPrice : Number.MAX_SAFE_INTEGER;
    const minPrice = query.minPrice ? query.minPrice : 0;

    if (orderBy !== OrderBy.Price && (query.maxPrice || query.minPrice)) {
      throw new Error('maxPrice and minPrice can only be used when orderBy is set to price');
    }

    const orderDirection = query.orderDirection ? query.orderDirection : DEFAULT_ORDER_DIRECTION;
    const limit = Number(query.limit) ?? 50;
    const cursor = this.cursorService.decodeCursorToObject<Cursor>(query.cursor);

    let firestoreQuery: FirebaseFirestore.Query<FirestoreDisplayOrderWithoutError> = ref.where(
      'metadata.chainId',
      '==',
      chainId
    );

    if (filterBySellOrder) {
      firestoreQuery = firestoreQuery.where('order.isSellOrder', '==', String(query.isSellOrder) === 'true');
    }

    if (filterByStatus) {
      firestoreQuery = firestoreQuery.where('order.status', '==', query.status);
    }

    if (filterByCollection) {
      firestoreQuery = firestoreQuery.where('order.collection', '==', query.collection);
    }

    if (filterByCollectionWide) {
      firestoreQuery = firestoreQuery.where('order.orderKind.numTokens', '==', 0);
    }

    switch (orderBy) {
      case OrderBy.Price: {
        firestoreQuery = firestoreQuery
          .where('order.startPriceEth', '>=', minPrice)
          .where('order.startPriceEth', '<=', maxPrice)
          .orderBy('order.startPriceEth', orderDirection) // future-todo: support dynamic orders - use currentPriceEth and handle price updates
          .orderBy('metadata.id', orderDirection);
        if (cursor.id && cursor.startPrice) {
          firestoreQuery = firestoreQuery.startAfter([cursor.startPrice, cursor.id]);
        }
        break;
      }
      case OrderBy.StartTime: {
        if (orderDirection == OrderDirection.Ascending) {
          throw new Error('Cannot order by start time in ascending order');
        }
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

    const [gasPrice, snap] = await Promise.all([
      this._ethereumService.getGasPrice(chainId),
      firestoreQuery.limit(limit + 1).get()
    ]);

    const orders = snap.docs.map((item) => item.data());
    const hasNextPage = orders.length > limit;

    if (hasNextPage) {
      orders.pop();
    }

    const lastOrder: FirestoreDisplayOrder | undefined = orders[orders.length - 1];

    const newCursor: Cursor = {
      startPrice: lastOrder?.order?.startPriceEth ?? cursor.startPrice ?? 0,
      startTime: lastOrder?.order?.startTimeMs ?? cursor.startTime ?? 0,
      endTime: lastOrder?.order?.endTimeMs ?? cursor.endTime ?? 0,
      id: lastOrder?.metadata?.id ?? cursor.id ?? ''
    };

    const encodedCursor = this.cursorService.encodeCursor(newCursor);
    const transformed = this.transformDisplayOrders(gasPrice, orders);
    const results = await this.mergeExecutionStatus(chainId, transformed);
    return {
      data: results,
      cursor: encodedCursor,
      hasNextPage
    };
  }

  async mergeExecutionStatus(chainId: ChainId, orders: Order[]) {
    try {
      const executionStatuses = await this.matchingEngineService.getExecutionStatuses(
        chainId,
        orders.map((item) => item.id)
      );

      return orders.map((item, index) => {
        return {
          ...item,
          executionStatus: executionStatuses[index]
        };
      });
    } catch (err) {
      console.error(err);
      return orders.map((item) => {
        return {
          ...item,
          executionStatus: null
        };
      });
    }
  }
}
