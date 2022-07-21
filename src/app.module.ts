import { StorageModule } from './storage/storage.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerMiddleware } from 'logger.middleware';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from './firebase/firebase.module';
import { StatsModule } from './stats/stats.module';
import { join } from 'path';
import { TwitterModule } from './twitter/twitter.module';
import { DiscordModule } from './discord/discord.module';
import { UserModule } from './user/user.module';
import { CollectionsModule } from 'collections/collections.module';
import { OrdersModule } from 'orders/orders.module';
import { MnemonicModule } from 'mnemonic/mnemonic.module';
import { FB_STORAGE_BUCKET } from './constants';
import { AlchemyModule } from './alchemy/alchemy.module';
import { EthereumModule } from './ethereum/ethereum.module';
import { BackfillModule } from 'backfill/backfill.module';
import { ZoraModule } from 'zora/zora.module';
import { OpenseaModule } from 'opensea/opensea.module';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { GemModule } from 'gem/gem.module';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyThrottlerGuard } from 'throttler/throttler.guard';
import { ApiUserModule } from './api-user/api-user.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { FeedModule } from 'feed/feed.module';

// TODO adi
import * as serviceAccount from './creds/nftc-dev-firebase-creds.json';
// import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '../.env'),
      isGlobal: true
    }),
    FirebaseModule.forRoot({
      cert: serviceAccount,
      storageBucket: FB_STORAGE_BUCKET
    }),
    CollectionsModule,
    FeedModule,
    TwitterModule,
    DiscordModule,
    StatsModule,
    UserModule,
    StorageModule,
    OrdersModule,
    MnemonicModule,
    AlchemyModule,
    EthereumModule,
    BackfillModule,
    ZoraModule,
    OpenseaModule,
    ReservoirModule,
    GemModule,
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 10
      // storage: new ThrottlerStorageRedisService('127.0.0.1:6379')
    }),
    ApiUserModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyThrottlerGuard
    }
  ],
  controllers: [AppController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
