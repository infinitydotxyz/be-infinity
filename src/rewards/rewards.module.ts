import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { CollectionsModule } from 'collections/collections.module';
import { MerkleTreeModule } from 'merkle-tree/merkle-tree.module';
import { ReferralsModule } from 'user/referrals/referrals.module';

@Module({
  providers: [RewardsService],
  exports: [RewardsService],
  controllers: [RewardsController],
  imports: [CollectionsModule, MerkleTreeModule, ReferralsModule]
})
export class RewardsModule {}
