import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { CollectionsModule } from 'collections/collections.module';

@Module({
  providers: [RewardsService],
  exports: [RewardsService],
  controllers: [RewardsController],
  imports: [CollectionsModule]
})
export class RewardsModule {}
