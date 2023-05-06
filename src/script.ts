/* eslint-disable @typescript-eslint/no-unused-vars */
import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from 'app.module';
import { ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { buildBlurBuyersFromCsv } from 'scripts/blurBuyers';
import { calcDailyBuyRewards } from 'scripts/calcDailyBuyRewards';
import {
  pushMetadataToSupportedColls,
  pushSupportedCollFlagToMainColls,
  setSupportedCollsInFirestore,
  fetchSupportedColls
} from 'scripts/supportedColls';
import { bn } from 'utils';

let app: NestExpressApplication;

export function getService<TInput = any, TResult = TInput>(
  service: Type<TInput> | string | symbol
): TResult | undefined {
  if (!app) {
    console.error('app not bootstrapped');
    return;
  }

  return app.get<TInput, TResult>(service);
}

export const inftClaims = async () => {
  const firebaseService = getService(FirebaseService);
  if (!firebaseService) {
    throw new Error('Firebase service not found');
  }

  const addresses = [
    '0x4a02cd742904a46e0926cba4d3382ad0403e8fcb',
    '0xe10fb1256570642dc2d49a74b6e8de5bb4225bfb',
    '0x8e45b9d3b8495d642b3e812a965da9043702f76f',
    '0x5d82e6bb0b87a445e558cb6a9018db03dd04d480',
    '0x51cfd86d777046e802b2d90ee7720862b5c638cf',
    '0x84d5ab1007bebf293a6e7751f59c643459deebfc',
    '0xa3e86a3d501679c6d758320589cac8f7efa7c463',
    '0xcb945057901fc1c17ecce4a4eec760057c6a28a2',
    '0x382b2a67e777a5b3b3676a185f85c365670ab639',
    '0xd64df10005817c61c7478021c8e9634eb28c94d0'
  ];

  const claimsRef = firebaseService.firestore.collection('airdropStats');
  const claims = await Promise.all(
    addresses.map(async (address) => {
      const query = claimsRef.doc(address);
      const doc = await query.get();
      const claim = doc.data();
      return claim;
    })
  );

  for (const claim of claims) {
    const address = claim?.address;
    const tokensEth = claim?.finalEarnedTokens;
    const tokensWei = ethers.utils.parseEther(String(tokensEth));

    const existingAirdrop = await firebaseService.firestore.collection('xflAirdrop').doc(address).get();
    const existingAirdropData = existingAirdrop.data() ?? {
      flurBalance: '0',
      inftBalance: '0',
      volumeUSD: 0,
      xflAirdrop: '0'
    };
    const updatedData = {
      flurBalance: existingAirdropData.flurBalance,
      inftBalance: tokensWei.toString(),
      volumeUSD: existingAirdropData.volumeUSD,
      xflAirdrop: bn(existingAirdropData.xflAirdrop).add(tokensWei.mul(5)).toString()
    };
    await firebaseService.firestore.collection('xflAirdrop').doc(address).set(updatedData, { merge: true });
  }
};

export const run = async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule);
  // await setSupportedCollsInFirestore();
  // await pushMetadataToSupportedColls();
  // await pushSupportedCollFlagToMainColls();
  // buildBlurBuyersFromCsv();
  // await fetchSupportedColls('1');
  // await inftClaims();
  // await calcDailyBuyRewards(1683072000000); // this is the timestamp of the day at 00:00:00 UTC for which daily buy rewards are being calculated
};

void run();
