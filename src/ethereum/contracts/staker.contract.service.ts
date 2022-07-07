import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { BigNumber, utils } from 'ethers';
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
    const balance: BigNumber = await contract.getUserStakePower(user.userAddress);
    const ether = utils.formatEther(balance);
    return +ether;
  }
}
