import { Module } from '@nestjs/common';
import { SetsController } from './sets.controller';
import SetsService from './sets.service';

@Module({
  providers: [SetsService],
  controllers: [SetsController],
  exports: [SetsService]
})
export class SetsModule {}
