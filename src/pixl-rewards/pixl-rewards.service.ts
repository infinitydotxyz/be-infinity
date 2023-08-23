import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { getUserRewards } from './referrals';

@Injectable()
export class PixlRewardsService {
  constructor(protected firebaseService: FirebaseService) {}

  async getRewards(userId: ParsedUserId) {
    const rewards = await getUserRewards(this.firebaseService.firestore, userId.userAddress);
    return rewards;
  }
}
