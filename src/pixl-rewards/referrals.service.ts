
import { ChainId } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { customAlphabet } from 'nanoid';
import { CollRef, DocRef } from 'types/firestore';
import { ParsedUserId } from 'user/parser/parsed-user-id';

interface ReferralCode {
  code: string;
  address: string;
  createdAt: number;
}

@Injectable()
export class ReferralsService {
  constructor(protected firebaseService: FirebaseService, protected ethereumService: EthereumService) { }
  private generateReferralCode() {
    // 308M ids for a 1% chance of collision
    const id = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12);
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
    const currentBlock = await this.ethereumService.getCurrentBlock(ChainId.Mainnet);
    const referralEvent = {
      kind: "REFERRAL",
      referree: user.userAddress,
      referrer: {
        code: referral.code,
      },
      blockNumber: currentBlock.number,
      timestamp: Date.now(),
      processed: false,
    };

    await this.firebaseService.firestore.collection("pixl").doc("pixlRewards").collection("pixlRewardEvents").doc().set(referralEvent);
  }
}
