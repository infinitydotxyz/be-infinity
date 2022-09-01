import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';

@Module({
  providers: [RewardsService],
  exports: [RewardsService],
  controllers: [RewardsController]
})
export class RewardsModule {}
