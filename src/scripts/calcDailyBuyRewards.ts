import { ChainId } from '@infinityxyz/lib/types/core';
import { getXFLStakerAddress } from '@infinityxyz/lib/utils';
import { XFLStakerABI } from '@infinityxyz/lib/abi/xflStaker';
import { Contract, ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { getService } from 'script';
import { DailyBuyTotals, UserDailyBuyReward } from 'types';
import { ConfigService } from '@nestjs/config';

const NUM_DAILY_BUY_REWARDS = 9_000_000;

export const calcDailyBuyRewards = async (timestamp: number) => {
  const configService = getService(ConfigService);
  if (!configService) {
    throw new Error('Config service not found');
  }

  const firebaseService = getService(FirebaseService);
  if (!firebaseService) {
    throw new Error('Firebase service not found');
  }

  const rpcProvider = new ethers.providers.StaticJsonRpcProvider(configService.get('alchemyJsonRpcEthMainnet'));

  const stakerAddress = getXFLStakerAddress(ChainId.Mainnet);
  const stakerContract = new Contract(stakerAddress, XFLStakerABI, rpcProvider);

  const xflDailyBuyRewardsDocRef = firebaseService.firestore.collection('xflBuyRewards').doc(timestamp.toString());
  const xflDailyBuyRewardsData = (await xflDailyBuyRewardsDocRef.get()).data() as DailyBuyTotals;
  const totalDailyVolume = xflDailyBuyRewardsData.dailyTotalVolumeETH;

  // now loop over all buyers for the day and calculate their rewards
  const xflDailyBuyersDocRef = xflDailyBuyRewardsDocRef.collection('buyers');
  const xflDailyBuyersDocs = await xflDailyBuyersDocRef.get();
  const xflDailyBuyersDocsData = xflDailyBuyersDocs.docs.map((doc) => doc.data() as UserDailyBuyReward);

  // now loop over all buyers for the day and calculate their rewards
  xflDailyBuyersDocsData.map(async (data) => {
    const buyer = data.address;
    const volumeETH = data.volumeETH;

    const numReferrals =
      (await firebaseService.firestore.collection('flowBetaReferralRewards').doc(buyer).get()).data()
        ?.numberOfReferrals ?? 0;
    const referralBoost =
      numReferrals < 10 ? 0 : numReferrals > 200 ? 2 : Number((Math.floor(numReferrals / 10) * 0.1).toFixed(1));

    const stakeLevel = await stakerContract.getUserStakeLevel(buyer);
    const stakeBoost =
      stakeLevel === 0 ? 0 : stakeLevel === 1 ? 0.5 : stakeLevel === 2 ? 1 : stakeLevel === 3 ? 1.5 : 2;

    const baseReward = (volumeETH / totalDailyVolume) * NUM_DAILY_BUY_REWARDS;
    const finalReward = baseReward * (1 + referralBoost + stakeBoost);

    const xflDailyBuyerDocRef = xflDailyBuyersDocRef.doc(buyer);
    await xflDailyBuyerDocRef.set({ finalReward, baseReward, referralBoost, stakeBoost }, { merge: true });
  });
};
