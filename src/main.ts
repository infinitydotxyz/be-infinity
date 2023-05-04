import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { auth, INFINITY_EMAIL, INFINITY_URL } from './constants';
import { HttpExceptionFilter } from './http-exception.filter';
// This is a hack to make Multer available in the Express namespace
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { API_KEY_HEADER, API_SECRET_HEADER } from 'auth/auth.constants';
import { SupportedCollectionsProvider } from 'common/providers/supported-collections-provider';
import { FirebaseService } from 'firebase/firebase.service';
import SetsService from 'sets/sets.service';
import { getZeroHourTimestamp } from 'utils';
import { trimLowerCase } from '@infinityxyz/lib/utils';
import { DailyBuyTotals, OverallBuyTotals, SaleData, UserDailyBuyReward } from 'types';

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
    .setTitle('Flow API')
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

  // setup sales query listener to show realtime trailing 24hr volume to end users
  const collection = firestore.collection('sales');
  const zeroHourTimestampOfTheDay = getZeroHourTimestamp(Date.now());
  const query = collection.where('source', '==', 'flow').where('timestamp', '>=', zeroHourTimestampOfTheDay);
  const observer = query.onSnapshot(
    (snap) => {
      console.log(`Received flow sales 24hr snapshot of size ${snap.size}`);
      handleFlow24HrSalesSnapshot(firestore, snap);
    },
    (err) => {
      console.log(`Encountered error while listening to flow sales 24hr snapshot: ${err}`);
    }
  );
}

function handleFlow24HrSalesSnapshot(firestore: FirebaseFirestore.Firestore, snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) {
  snap.docs.forEach((doc) => {
    const data = doc.data() as SaleData;
    const buyer = trimLowerCase(data.buyer);
    const price = data.price;
    const quantity = data.quantity;
    const timestamp = data.timestamp;
    const zeroHourTimestampOfTheDay = getZeroHourTimestamp(timestamp);

    const dailyBuyRewardDocRef = firestore.collection('xflBuyRewards').doc(zeroHourTimestampOfTheDay.toString());

    // record in rewards per day for the buyer
    const dailyBuyerRewardDocRef = dailyBuyRewardDocRef.collection('buyers').doc(buyer);
    dailyBuyerRewardDocRef
      .get()
      .then((snap) => {
        const data = snap.data() as UserDailyBuyReward;
        if (data) {
          const volumeETH = data.volumeETH + price;
          const numBuys = data.numBuys + quantity;
          dailyBuyerRewardDocRef.set({ volumeETH, numBuys }, { merge: true }).catch((err) => {
            console.log(`Encountered error while updating daily buyer amounts for ${buyer}: ${err}`);
          });
        } else {
          dailyBuyerRewardDocRef.set({ volumeETH: price, numBuys: quantity }, { merge: true }).catch((err) => {
            console.log(`Encountered error while updating daily buyer amounts for ${buyer}: ${err}`);
          });
        }
      })
      .catch((err) => {
        console.log(`Encountered error while updating daily buyer amounts for ${buyer}: ${err}`);
      });

    // record in rewards per day total
    dailyBuyRewardDocRef
      .get()
      .then((snap) => {
        const data = snap.data() as DailyBuyTotals;
        if (data) {
          const dailyTotalVolumeETH = data.dailyTotalVolumeETH + price;
          const dailyTotalNumBuys = data.dailyTotalNumBuys + quantity;
          dailyBuyRewardDocRef.set({ dailyTotalVolumeETH, dailyTotalNumBuys }, { merge: true }).catch((err) => {
            console.log(`Encountered error while updating daily buy total: ${err}`);
          });
        } else {
          dailyBuyRewardDocRef
            .set({ dailyTotalVolumeETH: price, dailyTotalNumBuys: quantity }, { merge: true })
            .catch((err) => {
              console.log(`Encountered error while updating daily buy total: ${err}`);
            });
        }
      })
      .catch((err) => {
        console.log(`Encountered error while updating daily buy total: ${err}`);
      });

    // record in overall total
    const overallBuyRewardDocRef = firestore.collection('xflBuyRewards').doc('totals');
    overallBuyRewardDocRef
      .get()
      .then((snap) => {
        const data = snap.data() as OverallBuyTotals;
        const totalVolumeETH = data.totalVolumeETH + price;
        const totalNumBuys = data.totalNumBuys + quantity;
        overallBuyRewardDocRef.set({ totalVolumeETH, totalNumBuys }, { merge: true }).catch((err) => {
          console.log(`Encountered error while updating overall buy total: ${err}`);
        });
      })
      .catch((err) => {
        console.log(`Encountered error while updating overall buy total: ${err}`);
      });
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await setup(app);
  // setupFirestoreQueryListeners(app);
  await app.listen(process.env.PORT || 9090);
}

void bootstrap();
