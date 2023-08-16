import { Module } from '@nestjs/common';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PixlRewardsController } from './pixl-rewards.controller';
import { ReferralsService } from './referrals.service';

@Module({
  controllers: [PixlRewardsController],
  providers: [ReferralsService],
  imports: [EthereumModule]
})
export class PixlRewardsModule { }
