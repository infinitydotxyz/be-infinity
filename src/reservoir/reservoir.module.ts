import { Module } from '@nestjs/common';
import { ReservoirService } from './reservoir.service';

@Module({
  providers: [ReservoirService],
  exports: [ReservoirService]
})
export class ReservoirModule {}
