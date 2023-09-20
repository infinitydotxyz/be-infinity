import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import {
  AirdropBoostEvent,
  ChainOrderStats,
  ChainStats,
  ChainUserOrderStats,
  ChainUserStats,
  DailyStats,
  formatDay,
  getAirdropTier,
  getDefaultTotalOrderStats,
  getUserRewards,
  OrderStats,
  parseDay,
  SalesStats,
  saveRewardsEvent,
  toDaily,
  TotalOrderStats,
  TotalStats,
  UserOrderStats,
  UserRewards,
  UserStats
} from './referrals';
import { FieldPath } from 'firebase-admin/firestore';
import { CollRef, DocRef } from 'types/firestore';
import { ONE_DAY } from '@infinityxyz/lib/utils';

export interface LeaderboardQuery {
  cursor?: string;
  limit?: number;
  orderBy?: 'total' | 'referrals' | 'buys' | 'listings';
}

@Injectable()
export class PixlRewardsService {
  constructor(protected firebaseService: FirebaseService, protected cursorService: CursorService) {}

  async getRewards(userId: ParsedUserId) {
    const rewards = await getUserRewards(this.firebaseService.firestore, userId.userAddress);
    return {
      referralPoints: rewards.data.referralPoints,
      listingPoints: rewards.data.listingPoints,
      airdropTier: getAirdropTier(rewards.data.airdropTier, rewards.data.airdropBoosted),
      buyPoints: rewards.data.buyPoints,
      totalPoints: rewards.data.totalPoints,
      updatedAt: rewards.data.updatedAt,
      user: rewards.data.user,
      airdropBoosted: rewards.data.airdropBoosted,
      numReferrals: rewards.data.numReferrals
    };
  }

  async getTopBuyers(options: { orderBy: 'volume' | 'nativeVolume' | 'numNativeBuys' | 'numBuys' }) {
    const salesByUserColl = this.firebaseService.firestore
      .collection('pixl')
      .doc('salesCollections')
      .collection('salesByUser') as CollRef<SalesStats>;
    const limit = 15;

    const query = salesByUserColl.orderBy(options.orderBy, 'desc');
    const snap = await query.limit(limit).get();

    const totalsDoc = this.firebaseService.firestore.collection('pixl').doc('salesCollections') as DocRef<SalesStats>;
    const totalsSnap = await totalsDoc.get();
    const totalsData = totalsSnap.data();

    return {
      data: snap.docs.map((item) => item.data()),
      total: totalsData?.[options.orderBy] ?? 0
    };
  }

  async getTopListers(options: { orderBy: keyof OrderStats }) {
    const ordersByUserColl = this.firebaseService.firestore
      .collection('pixl')
      .doc('orderCollections')
      .collection('ordersByUser') as CollRef<OrderStats>;
    const limit = 15;

    const query = ordersByUserColl.orderBy(options.orderBy, 'desc');
    const snap = await query.limit(limit).get();

    const totalsDoc = this.firebaseService.firestore.collection('pixl').doc('orderCollections') as DocRef<OrderStats>;
    const totalsSnap = await totalsDoc.get();
    const totalsData = totalsSnap.data();

    return {
      data: snap.docs.map((item) => item.data()),
      total: totalsData?.[options.orderBy] ?? 0
    };
  }

  async getOrderStats(filters: { user?: string; chainId?: string }) {
    const { ref: aggregatedOrderRewardsRef } = this.getAggregatedOrderRewardRef(filters);
    const aggregatedSnap = await aggregatedOrderRewardsRef.get();

    const data = aggregatedSnap.data() ?? {
      ...getDefaultTotalOrderStats()
    };

    return {
      aggregated: {
        numListings: data.numListings ?? 0,
        numListingsBelowFloor: data.numListingsBelowFloor ?? 0,
        numListingsNearFloor: data.numListingsNearFloor ?? 0,
        numCancelledListings: data.numCancelledListings ?? 0,

        numActiveListings: data.numActiveListings ?? 0,
        numActiveListingsBelowFloor: data.numActiveListingsBelowFloor ?? 0,
        numActiveListingsNearFloor: data.numActiveListingsNearFloor ?? 0,

        numBids: data.numBids ?? 0,
        numBidsBelowFloor: data.numBidsBelowFloor ?? 0,
        numBidsNearFloor: data.numBidsNearFloor ?? 0,
        numCancelledBids: data.numCancelledBids ?? 0,

        numActiveBids: data.numActiveBids ?? 0,
        numActiveBidsBelowFloor: data.numActiveBidsBelowFloor ?? 0,
        numActiveBidsNearFloor: data.numActiveBidsNearFloor ?? 0,

        numCollectionBids: data.numCollectionBids ?? 0,
        numCollectionBidsNearFloor: data.numCollectionBidsNearFloor ?? 0,
        numCollectionBidsBelowFloor: data.numCollectionBidsBelowFloor ?? 0,
        numCancelledCollectionBids: data.numCancelledCollectionBids ?? 0,

        numActiveCollectionBids: data.numActiveCollectionBids ?? 0,
        numActiveCollectionBidsBelowFloor: data.numActiveCollectionBidsBelowFloor ?? 0,
        numActiveCollectionBidsNearFloor: data.numCollectionBidsNearFloor ?? 0,

        numCancelledOrders: data.numCancelledOrders ?? 0
      }
    };
  }

  async getBuyRewardStats(filters: { user?: string; chainId?: string }) {
    const { ref: aggregatedBuyRewardsRef } = this.getAggregatedBuyRewardRef(filters);
    const limit = 30;
    const { query: historicalBuyRewardsQuery } = this.getHistoricalBuyRewardsQuery(filters, limit);

    const aggregatedPromise = aggregatedBuyRewardsRef.get();
    const historicalRewardsPromise = historicalBuyRewardsQuery.get();
    const [aggregatedResult, historicalRewardsResult] = await Promise.all([
      aggregatedPromise,
      historicalRewardsPromise
    ]);

    const aggregatedData = aggregatedResult.data() ?? {
      numBuys: 0,
      numNativeBuys: 0,
      nativeVolume: 0,
      volume: 0
    };

    const historical = historicalRewardsResult.docs.map((doc) => {
      return doc.data();
    });
    const today = Date.now();
    const lastThirtyDays = Array.from(Array(limit))
      .map((item, index) => {
        return today - ONE_DAY * index;
      })
      .map((timestamp) => {
        return formatDay(timestamp);
      });
    const results = lastThirtyDays
      .map((day) => {
        const statsForDay =
          historical.find((item) => item.day === day) ??
          toDaily(parseDay(day), {
            kind: 'TOTAL',
            numBuys: 0,
            numNativeBuys: 0,
            volume: 0,
            nativeVolume: 0
          });
        return {
          numBuys: statsForDay.numBuys,
          numNativeBuys: statsForDay.numNativeBuys,
          volume: statsForDay.volume,
          nativeVolume: statsForDay.nativeVolume,
          day: statsForDay.day,
          timestamp: statsForDay.timestamp
        };
      })
      .slice(0, limit);

    return {
      aggregated: {
        numBuys: aggregatedData.numBuys,
        numNativeBuys: aggregatedData.numNativeBuys,
        volume: aggregatedData.volume,
        nativeVolume: aggregatedData.nativeVolume
      },
      historical: results
    };
  }

  protected getHistoricalBuyRewardsQuery(filters: { user?: string; chainId?: string }, limit: number) {
    const salesByDay = this.firebaseService.firestore
      .collection('pixl')
      .doc('salesCollections')
      .collection('salesByDay') as CollRef<DailyStats>;
    let query: FirebaseFirestore.Query<DailyStats>;
    let kind;
    if (filters.user && filters.chainId) {
      kind = 'CHAIN_USER';
      query = salesByDay
        .where('kind', '==', kind)
        .where('user', '==', filters.user)
        .where('chainId', '==', filters.chainId);
    } else if (filters.user) {
      kind = 'USER';
      query = salesByDay.where('kind', '==', kind).where('user', '==', filters.user);
    } else if (filters.chainId) {
      kind = 'CHAIN';
      query = salesByDay.where('kind', '==', kind).where('chainId', '==', filters.chainId);
    } else {
      kind = 'TOTAL';
      query = salesByDay.where('kind', '==', kind);
    }

    query = query.orderBy('timestamp', 'desc');

    return {
      query: query.limit(limit),
      kind
    };
  }

  getAggregatedOrderRewardRef(filters: { user?: string; chainId?: string }) {
    if (filters.user && filters.chainId) {
      return {
        ref: this.getChainUserOrderStatsRef({ user: filters.user, chainId: filters.chainId }),
        kind: 'CHAIN_USER'
      };
    } else if (filters.user) {
      return {
        ref: this.getUserOrderStatsRef(filters.user),
        kind: 'USER'
      };
    } else if (filters.chainId) {
      return {
        ref: this.getChainOrderStatsRef(filters.chainId),
        kind: 'CHAIN'
      };
    }

    return {
      ref: this.firebaseService.firestore.collection('pixl').doc('orderCollections') as DocRef<TotalOrderStats>,
      kind: 'TOTAL'
    };
  }

  getAggregatedBuyRewardRef(filters: { user?: string; chainId?: string }) {
    if (filters.user && filters.chainId) {
      return {
        ref: this.getChainUserBuyRewardStatsRef({ user: filters.user, chainId: filters.chainId }),
        kind: 'CHAIN_USER'
      };
    } else if (filters.user) {
      return {
        ref: this.getUserBuyRewardStatsRef(filters.user),
        kind: 'USER'
      };
    } else if (filters.chainId) {
      return {
        ref: this.getChainBuyRewardStatsRef(filters.chainId),
        kind: 'CHAIN'
      };
    }
    return {
      ref: this.firebaseService.firestore.collection('pixl').doc('salesCollections') as DocRef<TotalStats>,
      kind: 'TOTAL'
    };
  }

  protected getUserBuyRewardStatsRef(user: string) {
    return this.firebaseService.firestore
      .collection('pixl')
      .doc('salesCollections')
      .collection('salesByUser')
      .doc(user) as DocRef<UserStats>;
  }

  protected getUserOrderStatsRef(user: string) {
    return this.firebaseService.firestore
      .collection('pixl')
      .doc('orderCollections')
      .collection('ordersByUser')
      .doc(user) as DocRef<UserOrderStats>;
  }

  protected getChainUserBuyRewardStatsRef(options: { user: string; chainId: string }) {
    return this.firebaseService.firestore
      .collection('pixl')
      .doc('salesCollections')
      .collection('salesByChainUser')
      .doc(`${options.chainId}:${options.user}`) as DocRef<ChainUserStats>;
  }

  protected getChainUserOrderStatsRef(options: { user: string; chainId: string }) {
    return this.firebaseService.firestore
      .collection('pixl')
      .doc('orderCollections')
      .collection('ordersByChainUser')
      .doc(`${options.chainId}:${options.user}`) as DocRef<ChainUserOrderStats>;
  }

  protected getChainBuyRewardStatsRef(chainId: string) {
    return this.firebaseService.firestore
      .collection('pixl')
      .doc('salesCollections')
      .collection('salesByChain')
      .doc(`${chainId}`) as DocRef<ChainStats>;
  }

  protected getChainOrderStatsRef(chainId: string) {
    return this.firebaseService.firestore
      .collection('pixl')
      .doc('orderCollections')
      .collection('ordersByChain')
      .doc(`${chainId}`) as DocRef<ChainOrderStats>;
  }

  async getLeaderboard(options: LeaderboardQuery) {
    const cursor = this.cursorService.decodeCursorToObject<{ value: number; user: string }>(options.cursor);
    const userRewardsRef = this.firebaseService.firestore
      .collection('pixl')
      .doc('pixlRewards')
      .collection('pixlUserRewards') as FirebaseFirestore.CollectionReference<UserRewards>;

    let orderBy: keyof UserRewards = 'totalPoints';
    switch (options.orderBy) {
      case 'total':
        orderBy = 'totalPoints';
        break;

      case 'listings':
        orderBy = 'listingPoints';
        break;

      case 'buys':
        orderBy = 'buyPoints';
        break;

      case 'referrals':
        orderBy = 'referralPoints';
        break;
    }

    const limit = Math.min(options.limit ?? 50, 50) > 0 ? Math.min(options.limit ?? 50, 50) : 50;
    let query = userRewardsRef.orderBy(orderBy, 'desc').orderBy(FieldPath.documentId(), 'desc');

    if (cursor.value != null && cursor.user != null) {
      query = query.startAfter(cursor.value, cursor.user);
    }

    const snap = await query.limit(limit).get();
    const results = snap.docs
      .map((item) => item.data())
      .map((item) => {
        return {
          user: item.user,
          referralPoints: item.referralPoints,
          totalPoints: item.totalPoints,
          buyPoints: item.buyPoints,
          listingPoints: item.listingPoints
        };
      });

    const hasNextPage = results.length >= limit;
    const lastItem = results[results.length - 1];
    const nextCursor = lastItem
      ? this.cursorService.encodeCursor({ value: lastItem[orderBy], user: lastItem.user })
      : options.cursor;

    return {
      data: results,
      cursor: nextCursor,
      hasNextPage
    };
  }

  async boostAirdrop(user: ParsedUserId) {
    const rewards = await getUserRewards(this.firebaseService.firestore, user.userAddress);

    if (rewards.data.airdropBoosted) {
      // already boosted, prevent unnecessary event from being created
      return;
    }

    const airdropBoostEvent: AirdropBoostEvent = {
      kind: 'AIRDROP_BOOST',
      user: user.userAddress,
      timestamp: Date.now(),
      processed: false
    };

    await saveRewardsEvent(this.firebaseService.firestore, airdropBoostEvent);
  }
}
