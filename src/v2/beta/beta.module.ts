import { Module } from '@nestjs/common';
import { BetaService } from './beta.service';

@Module({
  providers: [BetaService],
  exports: [BetaService]
})
export class BetaModule {}
