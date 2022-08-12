import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractService } from 'ethereum/contract.service';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class StakerContractService {
  constructor(private contractService: ContractService, private configService: ConfigService<EnvironmentVariables>) {}

  /**
   * Get the total number of tokens staked by the user.
   * @param user
   */
  async getTotalStaked(user: ParsedUserId) {
    const contract = this.contractService.getStakerContract(user.userChainId);
    const balance = await contract.getUserTotalStaked(user.userAddress);
    return this.contractService.toEther(balance);
  }

  getStakerAddress(chainId: ChainId) {
    return this.contractService.getStakerAddress(chainId);
  }
}
