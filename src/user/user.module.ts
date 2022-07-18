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
import { BackfillModule } from 'backfill/backfill.module';

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
    BackfillModule
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService]
})
export class UserModule {}
