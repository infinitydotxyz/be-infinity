import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class StakerContractService {
  constructor(private contractService: ContractService) {}

  /**
   * Returns the user's earned power (a.k.a votes).
   * @param user
   * @returns
   */
  async getPower(user: ParsedUserId): Promise<number> {
    const contract = this.contractService.getStakerContract(user.userChainId);
    const balance = await contract.getUserStakePower(user.userAddress);
    return balance;
  }

  /**
   * Get the total number of tokens staked by the user.
   * @param user
   */
  async getTotalStaked(user: ParsedUserId) {
    const contract = this.contractService.getStakerContract(user.userChainId);
    const balance = await contract.getUserTotalStaked(user.userAddress);
    return this.contractService.toEther(balance);
  }
}
