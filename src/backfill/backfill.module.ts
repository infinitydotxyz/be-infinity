import { Module } from '@nestjs/common';
import { AlchemyModule } from 'alchemy/alchemy.module';
import { GemModule } from 'gem/gem.module';
import { OpenseaModule } from 'opensea/opensea.module';
import { BackfillService } from './backfill.service';

@Module({
  providers: [BackfillService],
  exports: [BackfillService],
  imports: [AlchemyModule, OpenseaModule, GemModule]
})
export class BackfillModule {}
