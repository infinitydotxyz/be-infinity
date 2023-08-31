import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { AirdropBoostEvent, getAirdropTier, getUserRewards, saveRewardsEvent, UserRewards } from './referrals';
import { FieldPath } from 'firebase-admin/firestore';

export interface LeaderboardQuery {
  cursor?: string;
  limit?: number;
  kind?: 'total' | 'referrals';
}

@Injectable()
export class PixlRewardsService {
  constructor(protected firebaseService: FirebaseService, protected cursorService: CursorService) { }

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
      airdropBoosted: rewards.data.airdropBoosted
    }
  }

  async getLeaderboard(options: LeaderboardQuery) {
    const cursor = this.cursorService.decodeCursorToObject<{ value: number; user: string }>(options.cursor);
    const userRewardsRef = this.firebaseService.firestore
      .collection('pixl')
      .doc('pixlRewards')
      .collection('pixlUserRewards') as FirebaseFirestore.CollectionReference<UserRewards>;

    let orderBy: keyof UserRewards = 'totalPoints';
    switch (options.kind) {
      case 'total':
        orderBy = 'totalPoints';
        break;

      // case 'listings':
      //   orderBy = 'listingPoints';
      //   break;

      // case 'buys':
      //   orderBy = 'buyPoints';
      //   break;

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
          totalPoints: item.totalPoints
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
      kind: "AIRDROP_BOOST",
      user: user.userAddress,
      timestamp: Date.now(),
      processed: false,
    }

    await saveRewardsEvent(this.firebaseService.firestore, airdropBoostEvent);
  }
}
