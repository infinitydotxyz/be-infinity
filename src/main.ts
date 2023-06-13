import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { INFINITY_EMAIL, INFINITY_URL, auth } from './constants';
import { HttpExceptionFilter } from './http-exception.filter';
// This is a hack to make Multer available in the Express namespace
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { trimLowerCase } from '@infinityxyz/lib/utils';
import { API_KEY_HEADER, API_SECRET_HEADER } from 'auth/auth.constants';
import { SupportedCollectionsProvider } from 'common/providers/supported-collections-provider';
import { FirebaseService } from 'firebase/firebase.service';
import SetsService from 'sets/sets.service';
import { DailyBuyTotals, OverallBuyTotals, SaleData, UserBuyReward } from 'types';
import { getZeroHourTimestamp } from 'utils';
import { createHash } from 'crypto';

async function setup(app: INestApplication) {
  app.enableCors({
    origin: '*', // ORIGIN, // todo: use '*' for testing
    optionsSuccessStatus: 200
  });
  app.use(helmet());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip validated object of any properties that do not use any validation decorators
      transform: true
    })
  );

  const firebaseService = app.get(FirebaseService);
  const supportedCollections = new SupportedCollectionsProvider(firebaseService.firestore);
  await supportedCollections.init();

  const setsService = app.get(SetsService);
  setsService.setSupportedCollections(supportedCollections);

  if (process.env.INFINITY_NODE_ENV === 'dev') {
    setupSwagger(app, 'docs');
  }
}

function setupSwagger(app: INestApplication, path: string) {
  const config = new DocumentBuilder()
    .setTitle('Pixelpack API')
    .setDescription('Developer API')
    .setContact('infinity', INFINITY_URL, INFINITY_EMAIL)
    .setVersion('1.0.0')
    .addSecurity(auth.signature, {
      type: 'apiKey',
      scheme: `${auth.signature}: <user signed message>`,
      name: auth.signature,
      in: 'header',
      description: `Pass the user signed messaged in the ${auth.signature} header`
    })
    .addSecurity(auth.nonce, {
      type: 'apiKey',
      scheme: `${auth.nonce}: <numeric nonce>`,
      name: auth.nonce,
      in: 'header',
      description: `The expiration nonce that's visible in the ${auth.nonce} header`
    })
    .addSecurity(API_KEY_HEADER, {
      type: 'apiKey',
      scheme: `${API_KEY_HEADER}: <api key>`,
      name: API_KEY_HEADER,
      in: 'header',
      description: `The API key in the ${API_KEY_HEADER} header`
    })
    .addSecurity(API_SECRET_HEADER, {
      type: 'apiKey',
      scheme: `${API_SECRET_HEADER}: <api secret>`,
      name: API_SECRET_HEADER,
      in: 'header',
      description: `The API secret in the ${API_SECRET_HEADER} header`
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(path, app, document);
}

function setupFirestoreQueryListeners(app: INestApplication) {
  const firestore = app.get(FirebaseService).firestore;

  // setup sales query listeners to show realtime trailing 24hr volume to end users
  // sales are being duplicated due to a reservoir bug so first we write to a deduplicated collection
  const zeroHourTimestampOfTheDay = getZeroHourTimestamp(Date.now());
  const query = firestore
    .collection('sales')
    .where('source', '==', 'flow')
    .where('timestamp', '>=', zeroHourTimestampOfTheDay);
  query.onSnapshot(
    (snap) => {
      console.log(`Received flow sales 24hr snapshot of size ${snap.size}`);
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as SaleData;
          handleDeDuplication(firestore, data);
        }
      });
    },
    (err) => {
      console.log(`Encountered error while listening to flow sales 24hr snapshot: ${err}`);
    }
  );

  const deDupQuery = firestore.collection('deDuplicatedSales').where('timestamp', '>=', zeroHourTimestampOfTheDay);
  deDupQuery.onSnapshot(
    (snap) => {
      console.log(`Received de-duplicated flow sales 24hr snapshot of size ${snap.size}`);
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as SaleData;
          handleFlow24HrDeDuplicatedSalesSnapshot(firestore, data);
        }
      });
    },
    (err) => {
      console.log(`Encountered error while listening to de-duplicated flow sales 24hr snapshot: ${err}`);
    }
  );
}

function handleDeDuplication(firestore: FirebaseFirestore.Firestore, data: SaleData) {
  const chainId = data.chainId;
  const collectionAddress = data.collectionAddress;
  const tokenId = data.tokenId;
  const buyer = trimLowerCase(data.buyer);
  const txHash = data.txHash;
  const price = data.price;
  const quantity = data.quantity;

  const uniqueId = `${chainId}-${collectionAddress}-${tokenId}-${buyer}-${txHash}-${price}-${quantity}`;
  const uniqueIdHash = createHash('sha256').update(uniqueId).digest('hex');
  const dataWithHash = { ...data, uniqueIdHash };

  // write to deDuplicatedSales collection
  const deDuplicatedSalesDocRef = firestore.collection('deDuplicatedSales').doc(uniqueIdHash);
  deDuplicatedSalesDocRef.set({ ...dataWithHash }, { merge: true }).catch((err) => {
    console.log(`Encountered error while writing to deDuplicatedSales collection: ${err}`);
  });
}

function handleFlow24HrDeDuplicatedSalesSnapshot(firestore: FirebaseFirestore.Firestore, data: SaleData) {
  const uniqueIdHash = data.uniqueIdHash;
  const buyer = trimLowerCase(data.buyer);
  const price = data.price;
  const quantity = data.quantity;
  const timestamp = data.timestamp;
  const zeroHourTimestampOfTheDay = getZeroHourTimestamp(timestamp);

  const processedBuyRewardsCollectionRef = firestore
    .collection('processedBuyRewardHashes')
    .doc(zeroHourTimestampOfTheDay.toString())
    .collection('hashes');
  const dailyTotalBuyRewardDocRef = firestore.collection('xflBuyRewards').doc(zeroHourTimestampOfTheDay.toString());

  firestore
    .runTransaction(async (t) => {
      // first check if this sale has already been processed
      const processedSaleDocRef = processedBuyRewardsCollectionRef.doc(uniqueIdHash);
      // if this doc exists, sale has been processed, so return
      if ((await t.get(processedSaleDocRef)).exists) {
        return;
      }

      // read from rewards per day per buyer
      const dailyBuyerRewardDocRef = dailyTotalBuyRewardDocRef.collection('buyers').doc(buyer);
      const dailyBuyerRewardDocData = ((await t.get(dailyBuyerRewardDocRef)).data() as UserBuyReward) ?? {
        volumeETH: 0,
        numBuys: 0,
        address: buyer
      };
      const volumeETH = dailyBuyerRewardDocData.volumeETH + price;
      const numBuys = dailyBuyerRewardDocData.numBuys + quantity;

      // read from rewards per day total
      const dailyTotalBuyRewardDocData = ((await t.get(dailyTotalBuyRewardDocRef)).data() as DailyBuyTotals) ?? {
        dailyTotalNumBuys: 0,
        dailyTotalVolumeETH: 0
      };
      const dailyTotalVolumeETH = dailyTotalBuyRewardDocData.dailyTotalVolumeETH + price;
      const dailyTotalNumBuys = dailyTotalBuyRewardDocData.dailyTotalNumBuys + quantity;

      // read from overall rewards per buyer
      const overallBuyerRewardDocRef = firestore
        .collection('xflBuyRewards')
        .doc('totals')
        .collection('buyers')
        .doc(buyer);
      const overallBuyerRewardDocData = ((await t.get(overallBuyerRewardDocRef)).data() as UserBuyReward) ?? {
        volumeETH: 0,
        numBuys: 0,
        address: buyer
      };
      const overallBuyerolumeETH = overallBuyerRewardDocData.volumeETH + price;
      const overallBuyerNumBuys = overallBuyerRewardDocData.numBuys + quantity;

      // read from rewards overall total
      const overallBuyRewardDocRef = firestore.collection('xflBuyRewards').doc('totals');
      const overallBuyRewardDocData = ((await t.get(overallBuyRewardDocRef)).data() as OverallBuyTotals) ?? {
        totalVolumeETH: 0,
        totalNumBuys: 0
      };
      const totalVolumeETH = overallBuyRewardDocData.totalVolumeETH + price;
      const totalNumBuys = overallBuyRewardDocData.totalNumBuys + quantity;

      // write to rewards per day per buyer
      t.set(dailyBuyerRewardDocRef, { volumeETH, numBuys, address: buyer });

      // write to total rewards per day
      t.set(dailyTotalBuyRewardDocRef, { dailyTotalVolumeETH, dailyTotalNumBuys });

      // write to overall rewards per buyer
      t.set(
        overallBuyerRewardDocRef,
        {
          volumeETH: overallBuyerolumeETH,
          numBuys: overallBuyerNumBuys,
          address: buyer
        },
        { merge: true }
      );

      // write to total overall rewards
      t.set(overallBuyRewardDocRef, { totalVolumeETH, totalNumBuys });

      // finally write the processed doc to processedBuyRewardHashes collection
      t.set(processedSaleDocRef, { processed: true, uniqueIdHash });
    })
    .catch((err) => {
      console.log(`Encountered error while updating daily buyer amounts for ${buyer}: ${err}`);
    });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await setup(app);
  setupFirestoreQueryListeners(app);
  await app.listen(process.env.PORT || 9090);
}

void bootstrap();
