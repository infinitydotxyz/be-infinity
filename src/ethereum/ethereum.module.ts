import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EthereumService } from './ethereum.service';
import { ContractService } from './contract.service';
import { TokenContractService } from './contracts/token.contract.service';

@Module({
  providers: [EthereumService, ContractService, TokenContractService],
  imports: [ConfigModule],
  exports: [EthereumService, ContractService, TokenContractService]
})
export class EthereumModule {}
