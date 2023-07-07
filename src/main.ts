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
import { API_KEY_HEADER, API_SECRET_HEADER } from 'auth/auth.constants';
import { SupportedCollectionsProvider } from 'common/providers/supported-collections-provider';
import { FirebaseService } from 'firebase/firebase.service';
import { StatsService } from 'stats/stats.service';

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

  // update trending collections every 30 minutes
  const statsService = app.get(StatsService);
  setInterval(async () => {
    await statsService.fetchAndStoreTopCollectionsFromReservoir();
  }, 30 * 60 * 1000);

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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await setup(app);
  await app.listen(process.env.PORT || 9090);
}

void bootstrap();
