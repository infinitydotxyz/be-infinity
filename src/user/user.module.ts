import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { StatsModule } from 'stats/stats.module';
import { CollectionsModule } from 'collections/collections.module';
import { StorageModule } from 'storage/storage.module';
import { DiscordModule } from 'discord/discord.module';
import { TwitterModule } from 'twitter/twitter.module';
import { ProfileModule } from './profile/profile.module';
import { AlchemyModule } from 'alchemy/alchemy.module';
import { PaginationModule } from 'pagination/pagination.module';
import { RewardsModule } from 'rewards/rewards.module';
import { ReferralsModule } from './referrals/referrals.module';
import { ApiUserModule } from 'api-user/api-user.module';
import { ReservoirModule } from 'reservoir/reservoir.module';

@Module({
  imports: [
    StatsModule,
    CollectionsModule,
    StorageModule,
    DiscordModule,
    TwitterModule,
    ProfileModule,
    PaginationModule,
    AlchemyModule,
    RewardsModule,
    ReservoirModule,
    ReferralsModule,
    ApiUserModule
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService]
})
export class UserModule { }
