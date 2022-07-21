import { StorageModule } from './storage/storage.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerMiddleware } from 'logger.middleware';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL'); // TODO adi set the redis url in .env for prod
        let storage = undefined;
        if (redisUrl) {
          storage = new ThrottlerStorageRedisService(redisUrl);
        }
        return {
          ttl: 60,
          limit: 10,
          storage
        };
      }
    }),
    // ThrottlerModule.forRoot({
    //   ttl: 60,
    //   limit: 10,
    //   storage: process.env.REDIS_URL ? new ThrottlerStorageRedisService(process.env.REDIS_URL) : undefined
    // }),
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
