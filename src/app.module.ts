import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { BackfillModule } from 'backfill/backfill.module';
import { CollectionsModule } from 'collections/collections.module';
import { FeedModule } from 'feed/feed.module';
import { GemModule } from 'gem/gem.module';
import { LoggerMiddleware } from 'logger.middleware';
import { MnemonicModule } from 'mnemonic/mnemonic.module';
import { OpenseaModule } from 'opensea/opensea.module';
import { OrdersModule } from 'orders/orders.module';
import { join } from 'path';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { ApiKeyThrottlerGuard } from 'throttler/throttler.guard';
import { ZoraModule } from 'zora/zora.module';
import { AlchemyModule } from './alchemy/alchemy.module';
import { ApiUserModule } from './api-user/api-user.module';
import { AppController } from './app.controller';
import { FB_STORAGE_BUCKET, validateAndTransformEnvVariables } from './constants';
import { DiscordModule } from './discord/discord.module';
import { EthereumModule } from './ethereum/ethereum.module';
import { FirebaseModule } from './firebase/firebase.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.module';
import { TwitterModule } from './twitter/twitter.module';
import { UserModule } from './user/user.module';
import { envFileName } from './constants';
import { SalesModule } from 'sales/sales.module';
import { RewardsModule } from './rewards/rewards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(__dirname, `../${envFileName}`),
      isGlobal: true,
      validate: validateAndTransformEnvVariables
    }),
    FirebaseModule.forRoot({
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
      limit: 60,
      storage: undefined
    }),
    ApiUserModule,
    SalesModule,
    RewardsModule
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
