import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EthereumService } from './ethereum.service';
import { ContractService } from './contract.service';
import { StakerContractService } from './contracts/staker.contract.service';
import { TokenContractService } from './contracts/token.contract.service';
import { CmDistributorContractService } from './contracts/cm-distributor.contract.service';

@Module({
  providers: [
    EthereumService,
    ContractService,
    StakerContractService,
    TokenContractService,
    CmDistributorContractService
  ],
  imports: [ConfigModule],
  exports: [EthereumService, ContractService, StakerContractService, TokenContractService, CmDistributorContractService]
})
export class EthereumModule {}
