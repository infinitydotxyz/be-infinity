import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { BackfillModule } from 'backfill/backfill.module';
import { CollectionsModule } from 'collections/collections.module';
import { FavoritesModule } from 'favorites/favorites.module';
import { FeedModule } from 'feed/feed.module';
import { GemModule } from 'gem/gem.module';
import { LoggerMiddleware } from 'logger.middleware';
import { MnemonicModule } from 'mnemonic/mnemonic.module';
import { OpenseaModule } from 'opensea/opensea.module';
import { join } from 'path';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { SalesModule } from 'sales/sales.module';
import { ApiKeyThrottlerGuard } from 'throttler/throttler.guard';
import { ZoraModule } from 'zora/zora.module';
import { AlchemyModule } from './alchemy/alchemy.module';
import { ApiUserModule } from './api-user/api-user.module';
import { AppController } from './app.controller';
import { envFileName, secondaryEnvFileName, validateAndTransformEnvVariables } from './constants';
import { DiscordModule } from './discord/discord.module';
import { EthereumModule } from './ethereum/ethereum.module';
import { FirebaseModule } from './firebase/firebase.module';
import { MerkleTreeModule } from './merkle-tree/merkle-tree.module';
import { RafflesModule } from './raffles/raffles.module';
import { RewardsModule } from './rewards/rewards.module';
import { SearchModule } from './search/search.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.module';
import { TwitterModule } from './twitter/twitter.module';
import { UserModule } from './user/user.module';
import { BulkModule } from './v2/bulk/bulk.module';
import { CollectionsModule as V2CollectionsModule } from './v2/collections/collections.module';
import { GenerateModule } from './v2/generate/generate.module';
import { MatchingEngineModule } from './v2/matching-engine/matching-engine.module';
import { MatchingEngineService } from './v2/matching-engine/matching-engine.service';
import { OrdersModule as V2OrdersModule } from './v2/orders/orders.module';
import { UsersModule as V2UsersModule } from './v2/users/users.module';

import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { BetaModule } from './v2/beta/beta.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [join(__dirname, `../${envFileName}`), join(__dirname, `../${secondaryEnvFileName}`)],
      isGlobal: true,
      validate: validateAndTransformEnvVariables
    }),
    FirebaseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables>) => {
        const storageBucket = config.get<string>('FB_STORAGE_BUCKET');
        return {
          storageBucket
        };
      }
    }),
    CollectionsModule,
    FeedModule,
    TwitterModule,
    DiscordModule,
    StatsModule,
    UserModule,
    StorageModule,
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
        const redisUrl = config.get<string>('REDIS_URL');
        let storage = undefined;
        if (redisUrl) {
          storage = new ThrottlerStorageRedisService(redisUrl);
        }
        return {
          ttl: 60,
          limit: 30,
          storage
        };
      }
    }),
    ApiUserModule,
    SalesModule,
    RewardsModule,
    RafflesModule,
    FavoritesModule,
    MerkleTreeModule,
    SearchModule,
    V2OrdersModule,
    V2UsersModule,
    V2CollectionsModule,
    GenerateModule,
    BulkModule,
    BetaModule,
    MatchingEngineModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyThrottlerGuard
    },
    MatchingEngineService
  ],
  controllers: [AppController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
