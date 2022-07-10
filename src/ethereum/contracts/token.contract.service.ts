import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class TokenContractService {
  constructor(private contractService: ContractService) {}

  /**
   * Returns the total amount of tokens in the user's wallet.
   * @param user
   * @returns
   */
  async getTokenBalance(user: ParsedUserId): Promise<number> {
    const contract = this.contractService.getTokenContract(user.userChainId);
    const balance = await contract.balanceOf(user.userAddress);
    return this.contractService.toEther(balance);
  }
}
