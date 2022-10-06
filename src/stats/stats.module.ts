import { Module } from '@nestjs/common';
import { DiscordModule } from 'discord/discord.module';
import { PaginationModule } from 'pagination/pagination.module';
import { TwitterModule } from 'twitter/twitter.module';
import { MnemonicModule } from 'mnemonic/mnemonic.module';
import { StatsService } from './stats.service';
import { ZoraModule } from 'zora/zora.module';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { AlchemyModule } from 'alchemy/alchemy.module';

@Module({
  imports: [TwitterModule, DiscordModule, MnemonicModule, PaginationModule, ZoraModule, ReservoirModule, AlchemyModule],
  providers: [StatsService],
  exports: [StatsService]
})
export class StatsModule {}
