import { Module } from '@nestjs/common';

import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { RewardsModule } from 'rewards/rewards.module';
import { UserModule } from 'user/user.module';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';

@Module({
  providers: [RafflesService],
  controllers: [RafflesController],
  imports: [EthereumModule, PaginationModule, UserModule, RewardsModule]
})
export class RafflesModule {}
