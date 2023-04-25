import { AssetReferralDoc, AssetReferralVariant, ChainId, ReferralTotals } from '@infinityxyz/lib/types/core';
import { AssetReferralDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class ReferralsService {
  constructor(protected firebaseService: FirebaseService) {}

  async getReferralRewards(referrer: ParsedUserId, chainId: ChainId): Promise<ReferralTotals> {
    const userAddress = referrer.userAddress;
    const ref = this.firebaseService.firestore.collection('flowBetaReferralRewards').doc(userAddress);
    const doc = await ref.get();
    const numReferrals = doc.data()?.numberOfReferrals ?? 0;

    const referralCodeRef = this.firebaseService.firestore.collection('flowBetaReferralCodes').where('owner.address', '==', userAddress);
    const snap = await referralCodeRef.get();
    const referralCode = snap.docs[0]?.data()?.referralCode ?? '';

    const totals = {
      referralLink: `https://flow.so/?ref=${referralCode}`,
      referrer: {
        address: referrer.userAddress,
        displayName: '',
        username: '',
        profileImage: '',
        bannerImage: ''
      },
      metadata: {
        chainId,
        updatedAt: 0
      },
      stats: {
        numReferrals,
        numReferralSales: 0,
        totalFeesGenerated: {
          feesGeneratedWei: '0',
          feesGeneratedEth: 0,
          feesGeneratedUSDC: 0
        }
      }
    };

    return totals;
  }

  // async getReferralRewards(referrer: ParsedUserId, chainId: ChainId): Promise<ReferralTotals> {
  //   const totalsRef = referrer.ref
  //     .collection(firestoreConstants.REFERRALS_COLL)
  //     .doc(chainId) as FirebaseFirestore.DocumentReference<ReferralTotals>;

  //   const totalsSnap = await totalsRef.get();
  //   const totals = totalsSnap.data() ?? {
  //     referrer: {
  //       address: referrer.userAddress,
  //       displayName: '',
  //       username: '',
  //       profileImage: '',
  //       bannerImage: ''
  //     },
  //     metadata: {
  //       chainId,
  //       updatedAt: 0
  //     },
  //     stats: {
  //       numReferralSales: 0,
  //       totalFeesGenerated: {
  //         feesGeneratedWei: '0',
  //         feesGeneratedEth: 0,
  //         feesGeneratedUSDC: 0
  //       }
  //     }
  //   };

  //   return totals;
  // }

  async saveReferral(user: ParsedUserId, referral: AssetReferralDto): Promise<void> {
    const collectionDocId = `${referral.assetChainId}:${referral.assetAddress}`;
    const assetDocId =
      typeof referral.assetTokenId === 'string' && referral.assetTokenId
        ? `${collectionDocId}:${referral.assetTokenId}`
        : collectionDocId;
    const assetReferralRef = user.ref
      .collection(firestoreConstants.REFERRALS_COLL)
      .doc(referral.assetChainId)
      .collection(firestoreConstants.ASSET_REFERRALS_COLL)
      .doc(assetDocId) as FirebaseFirestore.DocumentReference<AssetReferralDoc>;

    let referralData: AssetReferralDoc = {
      discriminator: AssetReferralVariant.Collection,
      referrer: referral.referrer,
      assetAddress: referral.assetAddress,
      assetChainId: referral.assetChainId,
      referredUser: user.userAddress,
      referredAt: Date.now()
    };

    if (referral.assetTokenId) {
      referralData = {
        ...referralData,
        assetTokenId: referral.assetTokenId,
        discriminator: AssetReferralVariant.Nft
      };
    }

    await assetReferralRef.set(referralData, { merge: true });
  }
}
