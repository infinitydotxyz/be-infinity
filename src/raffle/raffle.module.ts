import { Module } from '@nestjs/common';
import { RaffleService } from './raffle.service';
import { RaffleController } from './raffle.controller';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { UserModule } from 'user/user.module';

@Module({
  providers: [RaffleService],
  controllers: [RaffleController],
  imports: [EthereumModule, PaginationModule, UserModule]
})
export class RaffleModule {}
