import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EthereumService } from './ethereum.service';
import { ContractService } from './contract.service';
import { StakerContractService } from './contracts/staker.contract.service';

@Module({
  providers: [EthereumService, ContractService, StakerContractService],
  imports: [ConfigModule],
  exports: [EthereumService, ContractService, StakerContractService]
})
export class EthereumModule {}
