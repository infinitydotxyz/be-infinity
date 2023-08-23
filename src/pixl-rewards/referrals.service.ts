
import { ChainId } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { customAlphabet } from 'nanoid';
import { CollRef, DocRef } from 'types/firestore';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { getUserByReferralCode, getUserReferrers, ReferralEvent, saveRewardsEvent } from './referrals';

interface ReferralCode {
  code: string;
  address: string;
  createdAt: number;
}

@Injectable()
export class ReferralsService {
  constructor(protected firebaseService: FirebaseService, protected ethereumService: EthereumService) { }
  private generateReferralCode() {
    const id = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);
    return id();
  }

  async getReferralCode(user: ParsedUserId): Promise<ReferralCode> {
    const referralCodesRef = this.firebaseService.firestore.collection('pixl').doc('pixlReferrals').collection("pixlReferralCodes") as CollRef<ReferralCode>;
    const referralCodeQuery = referralCodesRef.where("address", '==', user.userAddress);
    const snap = await referralCodeQuery.get();
    const data = snap.docs?.[0]?.data();

    if (data) {
      return data;
    }

    return await this.firebaseService.firestore.runTransaction(async (txn) => {
      const referralCode: ReferralCode = {
        code: this.generateReferralCode(),
        address: user.userAddress,
        createdAt: Date.now()
      };
      // ensure that referral codes are unique
      const referralRef = referralCodesRef.doc(referralCode.code) as DocRef<ReferralCode>;
      txn.create(referralRef, referralCode);
      return referralCode;
    });
  }

  async saveReferral(user: ParsedUserId, referral: { code: string }): Promise<void> {
    const chainId = ChainId.Mainnet;

    const existingReferrers = await getUserReferrers(this.firebaseService.firestore, user.userAddress);
    if (existingReferrers.primary) {
      // user already has a referrer
      return;
    }

    const currentBlock = await this.ethereumService.getCurrentBlock(chainId);
    const { address: referrer } = await getUserByReferralCode(this.firebaseService.firestore, referral.code);
    if (!referrer) {
      throw new Error(`Invalid referral code ${referral.code}`);
    }
    const referralEvent: ReferralEvent = {
      kind: "REFERRAL",
      referree: user.userAddress,
      referrer: {
        code: referral.code,
        address: referrer
      },
      blockNumber: currentBlock.number,
      timestamp: Date.now(),
      processed: false,
    };
    await saveRewardsEvent(this.firebaseService.firestore, referralEvent);
  }
}
