import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { getService } from 'script';

export const calcINFTDistribution = async () => {
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

  while (!breakLoop) {
    console.log('Starting after', startAfter);
    const xflAirdropColl = await firebaseService.firestore
      .collection('xflAirdrop')
      .where('inftBalance', '!=', '0')
      .limit(limit)
      .orderBy('inftBalance', 'asc')
      .startAt(startAfter)
      .get();

    console.log('Num airdrop docs', xflAirdropColl.size);
    const lastDoc = xflAirdropColl.docs[xflAirdropColl.size - 1];
    startAfter = lastDoc.get('inftBalance') ?? '';

    for (const airdropDoc of xflAirdropColl.docs) {
      const address = airdropDoc.id;

      // get INFT airdrop reward
      const inftBalanceWei = airdropDoc.get('inftBalance') as string;
      const inftBalanceEth = parseFloat(ethers.utils.formatEther(inftBalanceWei));
      const isINFT = inftBalanceWei === '0' ? false : true;

      if (isINFT) {
        // write to firestore
        console.log('Writing to firestore', address);
        await firebaseService.firestore.collection('flowSeasonOneRewards').doc(address).set(
          {
            airdropRewardAmountFromINFT: inftBalanceEth
          },
          { merge: true }
        );
      }
    }

    if (xflAirdropColl.size < limit) {
      breakLoop = true;
    }
  }

  console.log('Done!');
};
