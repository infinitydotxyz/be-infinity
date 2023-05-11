import { ChainId } from '@infinityxyz/lib/types/core';
import { getXFLStakerAddress } from '@infinityxyz/lib/utils';
import { XFLStakerABI } from '@infinityxyz/lib/abi/xflStaker';
import { Contract, ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { getService } from 'script';
import { DailyBuyTotals, UserBuyReward } from 'types';
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

  console.log('Calculating daily buy rewards for timestamp', timestamp);

  const rpcProvider = new ethers.providers.StaticJsonRpcProvider(configService.get('alchemyJsonRpcEthMainnet'));

  const stakerAddress = getXFLStakerAddress(ChainId.Mainnet);
  const stakerContract = new Contract(stakerAddress, XFLStakerABI, rpcProvider);

  const xflDailyBuyRewardsDocRef = firebaseService.firestore.collection('xflBuyRewards').doc(timestamp.toString());
  const xflDailyBuyRewardsData = (await xflDailyBuyRewardsDocRef.get()).data() as DailyBuyTotals;
  if (!xflDailyBuyRewardsData) {
    console.error('No daily buy rewards data found for timestamp ' + timestamp.toString());
    return;
  }
  const totalDailyVolume = xflDailyBuyRewardsData.dailyTotalVolumeETH;

  // now loop over all buyers for the day and calculate their rewards
  const xflDailyBuyersDocRef = xflDailyBuyRewardsDocRef.collection('buyers');
  const xflDailyBuyersDocs = await xflDailyBuyersDocRef.get();
  console.log('Num buyers', xflDailyBuyersDocs.size);
  const xflDailyBuyersDocsData = xflDailyBuyersDocs.docs.map((doc) => doc.data() as UserBuyReward);

  let numHandled = 0;
  // now loop over all buyers for the day and calculate their rewards
  for (const data of xflDailyBuyersDocsData) {
    const buyer = data.address;
    const volumeETH = data.volumeETH;

    const numReferrals =
      (await firebaseService.firestore.collection('flowBetaReferralRewards').doc(buyer).get()).data()
        ?.numberOfReferrals ?? 0;
    const referralBoost =
      numReferrals < 10 ? 0 : numReferrals > 200 ? 2 : Number((Math.floor(numReferrals / 10) * 0.1).toFixed(1));

    // adi-todo when staker event listener is ready, use that instead of this
    const stakeLevel = await stakerContract.getUserStakeLevel(buyer);
    const stakeBoost =
      stakeLevel === 0 ? 0 : stakeLevel === 1 ? 0.5 : stakeLevel === 2 ? 1 : stakeLevel === 3 ? 1.5 : 2;

    const baseReward = (volumeETH / totalDailyVolume) * NUM_DAILY_BUY_REWARDS;
    const finalReward = baseReward * (1 + referralBoost + stakeBoost);

    const processedTimestampsRef = firebaseService.firestore
      .collection('xflBuyRewards')
      .doc('totals')
      .collection('processedTimestamps');

    await firebaseService.firestore
      .runTransaction(async (t) => {
        // check if timestamp and buyer is already processed in totals
        const processedTimestampsDocRef = processedTimestampsRef.doc(timestamp.toString());
        const processedTimestampBuyerDocRef = processedTimestampsDocRef.collection('buyers').doc(buyer);
        const isProcessed = (await t.get(processedTimestampBuyerDocRef)).exists;

        // read from overall rewards per buyer
        const overallBuyerRewardDocRef = firebaseService.firestore
          .collection('xflBuyRewards')
          .doc('totals')
          .collection('buyers')
          .doc(buyer);
        const overallBuyerRewardDocData = ((await t.get(overallBuyerRewardDocRef)).data() as UserBuyReward) ?? {
          baseReward: 0,
          finalReward: 0
        };

        // write to rewards per day per buyer
        const xflDailyBuyerDocRef = xflDailyBuyersDocRef.doc(buyer);
        t.set(xflDailyBuyerDocRef, { finalReward, baseReward, referralBoost, stakeBoost }, { merge: true });

        // write to overall rewards per buyer only if buyer not processed previously
        if (!isProcessed) {
          const cumulativeBaseReward = (overallBuyerRewardDocData.baseReward ?? 0) + baseReward;
          const cumulativeFinalReward = (overallBuyerRewardDocData.finalReward ?? 0) + finalReward;
          t.set(
            overallBuyerRewardDocRef,
            {
              baseReward: cumulativeBaseReward,
              finalReward: cumulativeFinalReward
            },
            { merge: true }
          );
        } else {
          console.log('Already processed', buyer, 'for timestamp', timestamp);
        }

        // write to processed timestamps
        t.set(processedTimestampBuyerDocRef, { processed: true, address: buyer });
      })
      .then(() => {
        numHandled++;
        console.log(`Successfully updated daily buyer amounts for ${buyer}`);
        console.log('Handled', numHandled, 'of', xflDailyBuyersDocs.size);
      })
      .catch((err) => {
        console.log(`Encountered error while updating daily buyer amounts for ${buyer}: ${err}`);
      });
  }
};
