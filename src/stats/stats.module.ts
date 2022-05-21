import { Module } from '@nestjs/common';
import { BackfillModule } from 'backfill/backfill.module';
import { DiscordModule } from 'discord/discord.module';
import { PaginationModule } from 'pagination/pagination.module';
import { TwitterModule } from 'twitter/twitter.module';
import { VotesModule } from 'votes/votes.module';
import { StatsService } from './stats.service';

@Module({
  imports: [TwitterModule, DiscordModule, VotesModule, PaginationModule, BackfillModule],
  providers: [StatsService],
  exports: [StatsService]
})
export class StatsModule {}
