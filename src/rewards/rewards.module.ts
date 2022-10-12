import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { CollectionsModule } from 'collections/collections.module';
import { MerkleTreeModule } from 'merkle-tree/merkle-tree.module';

@Module({
  providers: [RewardsService],
  exports: [RewardsService],
  controllers: [RewardsController],
  imports: [CollectionsModule, MerkleTreeModule]
})
export class RewardsModule {}
