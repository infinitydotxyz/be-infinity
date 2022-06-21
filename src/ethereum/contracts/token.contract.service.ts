import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractService } from 'ethereum/contract.service';
import { BigNumber, Contract, utils } from 'ethers';

@Injectable()
export class TokenContractService {
  private readonly contract: Contract;

  constructor(private contractService: ContractService, private configService: ConfigService) {
    const chainId = this.configService.get<string>('contractChainId');
    this.contract = contractService.getTokenContract(chainId!);
  }

  async getVotes(address: string): Promise<number> {
    const balance: BigNumber = await this.contract.getVotes(address);
    console.log(balance);
    const ether = utils.formatEther(balance);
    return +ether;
  }
}
