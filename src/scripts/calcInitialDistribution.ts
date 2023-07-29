import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { getService } from 'script';
import { calcTotalBuyRewards } from './calcDailyBuyRewards';
import { nFormatter } from 'utils';

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
  let startAt = '';
  const limit = 300;

  while (!breakLoop) {
    console.log(
      'Starting at',
      startAt,
      totalUsers,
      totalUsersWithAirdropReward,
      totalUsersWithReferralReward,
      totalUsersWithReward
    );
    const xflAirdropColl = await firebaseService.firestore
      .collection('xflAirdrop')
      .limit(limit)
      .where('xflAirdrop', '!=', '0')
      .orderBy('xflAirdrop', 'asc')
      .startAt(startAt)
      .get();

    console.log('Num airdrop docs', xflAirdropColl.size);
    const lastDoc = xflAirdropColl.docs[xflAirdropColl.size - 1];
    startAt = lastDoc.get('xflAirdrop') ?? '';

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
        console.log(
          'Writing to firestore',
          address,
          buyRewardAmount,
          airdropRewardAmount,
          referralRewardAmount,
          totalRewardAmount
        );
        await firebaseService.firestore.collection('flowSeasonOneRewards').doc(address).set({
          address,
          buyRewardAmount,
          airdropRewardAmount,
          referralRewardAmount,
          totalRewardAmount
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

export const analyzeInitialDistribution = async () => {
  const configService = getService(ConfigService);
  if (!configService) {
    throw new Error('Config service not found');
  }

  const firebaseService = getService(FirebaseService);
  if (!firebaseService) {
    throw new Error('Firebase service not found');
  }

  let breakLoop = false;
  let startAfter = '';
  const limit = 100;

  let totalUsers = 0;
  let totalINFTUsers = 0;
  let totalTransactedByINFTUsers = 0;
  let aggregateRewardAmount = 0;
  let aggregateBuyRewardAmount = 0;
  let aggregateAirdropRewardAmount = 0;
  let aggregateReferralRewardAmount = 0;
  let aggregateAirdropRewardAmountFromINFT = 0;

  const exclWallets = ['0x2f9961596a2882ec3ed022c5599b38798fe6485e', '0xdbd8277e2e16aa40f0e5d3f21ffe600ad706d979'];

  while (!breakLoop) {
    const rewardsColl = await firebaseService.firestore
      .collection('flowSeasonOneRewards')
      .limit(limit)
      .orderBy('address', 'asc')
      .startAfter(startAfter)
      .get();

    const lastDoc = rewardsColl.docs[rewardsColl.size - 1];
    startAfter = lastDoc.get('address') ?? 0;

    for (const rewardDoc of rewardsColl.docs) {
      const address = rewardDoc.id;
      if (exclWallets.includes(address)) {
        continue;
      }
      totalUsers++;
      const totalRewardAmount = rewardDoc.get('totalRewardAmount');
      const buyRewardAmount = rewardDoc.get('buyRewardAmount');
      const airdropRewardAmount = rewardDoc.get('airdropRewardAmount');
      const referralRewardAmount = rewardDoc.get('referralRewardAmount');
      const airdropRewardAmountFromINFT = rewardDoc.get('airdropRewardAmountFromINFT');
      aggregateRewardAmount += totalRewardAmount;
      aggregateBuyRewardAmount += buyRewardAmount;
      aggregateAirdropRewardAmount += airdropRewardAmount;
      aggregateReferralRewardAmount += referralRewardAmount;

      if (airdropRewardAmountFromINFT > 0) {
        totalINFTUsers++;
        aggregateAirdropRewardAmountFromINFT += totalRewardAmount;
        // get the amount spent by this user on Infinity v1
        const infinityV1Airdrop = await firebaseService.firestore.collection('airdropStats').doc(address).get();
        const earnedTokens = infinityV1Airdrop.get('earnedTokens');
        const finalEarnedTokens = infinityV1Airdrop.get('finalEarnedTokens');
        const transacted = infinityV1Airdrop.get('transacted') ?? 0;
        totalTransactedByINFTUsers += transacted;
        if (!earnedTokens || !finalEarnedTokens) {
          console.log(
            'INFT',
            address,
            transacted,
            nFormatter(earnedTokens),
            nFormatter(finalEarnedTokens),
            nFormatter(airdropRewardAmountFromINFT),
            nFormatter(totalRewardAmount)
          );
        }
      }
    }

    if (rewardsColl.size < limit) {
      breakLoop = true;
    }
  }

  // log amounts
  console.log('Total users', totalUsers);
  console.log('Total INFT users', totalINFTUsers);
  console.log(
    'Total transacted by INFT users',
    nFormatter(totalTransactedByINFTUsers),
    'fees paid',
    nFormatter(totalTransactedByINFTUsers * 0.015)
  );
  console.log('Total reward amount', nFormatter(aggregateRewardAmount));
  console.log('Total buy reward amount', nFormatter(aggregateBuyRewardAmount));
  console.log('Total airdrop reward amount', nFormatter(aggregateAirdropRewardAmount));
  console.log('Total referral reward amount', nFormatter(aggregateReferralRewardAmount));
  console.log('Total airdrop reward amount from INFT', nFormatter(aggregateAirdropRewardAmountFromINFT));

  console.log('Done!');
};
