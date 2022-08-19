import { ChainId } from '@infinityxyz/lib/types/core';
import * as functions from 'firebase-functions';
import { TokenPriceService } from 'token-price/token-price.service';
import { getService } from './utils';

export const testFunction = functions
  .region('us-east1')
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document('test/{id}')
  .onWrite(async (change, context) => {
    console.log(`TEST FUNCTION TRIGGERED ${context.params.id}`);
    const tokenPriceService = await getService(TokenPriceService);
    const price = await tokenPriceService.getTokenPrice(
      '0x4d224452801aced8b2f0aebe155379bb5d594381',
      ChainId.Mainnet,
      18,
      'APE',
      'Ape Coin'
    );

    await change.after.ref.set({ hello: 'world' }, { merge: true });

    console.log(price);

    console.log('TEST FUNCTION COMPLETE');
  });
