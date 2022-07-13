import { Module } from '@nestjs/common';
import { DiscordModule } from 'discord/discord.module';
import { PaginationModule } from 'pagination/pagination.module';
import { TwitterModule } from 'twitter/twitter.module';
import { StatsService } from './stats.service';
import { ZoraModule } from 'zora/zora.module';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { GemModule } from 'gem/gem.module';

@Module({
  imports: [TwitterModule, DiscordModule, GemModule, PaginationModule, ZoraModule, ReservoirModule],
  providers: [StatsService],
  exports: [StatsService]
})
export class StatsModule {}
