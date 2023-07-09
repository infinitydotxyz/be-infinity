import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { getService } from 'script';
import { calcTotalBuyRewards } from './calcDailyBuyRewards';

export const calcInitialDistribution = async () => {
  const configService = getService(ConfigService);
  if (!configService) {
    throw new Error('Config service not found');
  }

  const firebaseService = getService(FirebaseService);
  if (!firebaseService) {
    throw new Error('Firebase service not found');
  }

  const buyRewardsMap = await calcTotalBuyRewards();

  console.log('Calculating earned airdrop and referral rewards');
  let totalReferralRewards = 0;
  let totalAirdropRewards = 0;
  let totalUsers = 0;
  let totalUsersWithAirdropReward = 0;
  let totalUsersWithReferralReward = 0;
  let totalUsersWithReward = 0;
  let breakLoop = false;
  let startAfter = '';
  const limit = 100;

  while (!breakLoop) {
    console.log('Starting after', startAfter, totalUsers, totalUsersWithAirdropReward, totalUsersWithReferralReward, totalUsersWithReward);
    const xflAirdropColl = await firebaseService.firestore
      .collection('xflAirdrop')
      .limit(limit)
      .orderBy('xflAirdrop', 'asc')
      .startAfter(startAfter)
      .get();

    console.log('Num airdrop docs', xflAirdropColl.size);
    const lastDoc = xflAirdropColl.docs[xflAirdropColl.size - 1];
    startAfter = lastDoc.get('xflAirdrop') ?? '';

    for (const airdropDoc of xflAirdropColl.docs) {
      totalUsers++;
      const address = airdropDoc.id;

      // get buy reward
      const buyRewardAmount = buyRewardsMap.get(address) ?? 0;

      // get airdrop reward
      const xflAmountWei = airdropDoc.get('xflAirdrop') ?? ('0' as string);
      const xflAmountEth = parseFloat(ethers.utils.formatEther(xflAmountWei));
      const isINFT = (airdropDoc.get('inftBalance') as string) === '0' ? false : true;

      // get referral reward
      const referralReward = await firebaseService.firestore.collection('flowBetaReferralRewards').doc(address).get();
      const numReferrals = referralReward.data()?.numberOfReferrals ?? 0;
      const referralRewardAmount = numReferrals * 2000;
      if (referralRewardAmount > 0) {
        totalUsersWithReferralReward++;
        totalReferralRewards += referralRewardAmount;
      }

      const airdropClaimed = isINFT || numReferrals >= 2 ? true : false;
      if (airdropClaimed) {
        totalUsersWithAirdropReward++;
        totalAirdropRewards += xflAmountEth;
      }
      const airdropRewardAmount = airdropClaimed ? xflAmountEth : 0;

      if (airdropClaimed || referralRewardAmount > 0) {
        totalUsersWithReward++;
      }

      const totalRewardAmount = buyRewardAmount + airdropRewardAmount + referralRewardAmount;
      if (totalRewardAmount > 0) {
        // write to firestore
        console.log('Writing to firestore', address, buyRewardAmount, airdropRewardAmount, referralRewardAmount, totalRewardAmount);
        await firebaseService.firestore.collection('flowSeasonOneRewards').doc(address).set({
          address,
          buyRewardAmount,
          airdropRewardAmount,
          referralRewardAmount,
          totalRewardAmount,
        });
      }
    }

    if (xflAirdropColl.size < limit) {
      breakLoop = true;
    }
  }

  console.log('Total users', totalUsers);
  console.log('Total users with airdrop reward', totalUsersWithAirdropReward);
  console.log('Total users with referral reward', totalUsersWithReferralReward);
  console.log('Total users with reward', totalUsersWithReward);
  console.log('Total referral rewards', totalReferralRewards, totalReferralRewards / 1_000_000);
  console.log('Total airdrop rewards', totalAirdropRewards, totalAirdropRewards / 1_000_000);
  console.log('Done!');
};