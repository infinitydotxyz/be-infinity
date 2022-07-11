import { Module } from '@nestjs/common';
import { GemService } from './gem.service';

@Module({
  providers: [GemService],
  exports: [GemService]
})
export class GemModule {}
