import { Module } from '@nestjs/common';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PixlRewardsController } from './pixl-rewards.controller';
import { PixlRewardsService } from './pixl-rewards.service';
import { ReferralsService } from './referrals.service';

@Module({
  controllers: [PixlRewardsController],
  providers: [ReferralsService, PixlRewardsService],
  imports: [EthereumModule]
})
export class PixlRewardsModule { }
