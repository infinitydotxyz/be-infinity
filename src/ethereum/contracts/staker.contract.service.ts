import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class StakerContractService {
  constructor(private contractService: ContractService) {}

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
