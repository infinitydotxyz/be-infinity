import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { BigNumber, utils } from 'ethers';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class TokenContractService {
  constructor(private contractService: ContractService) {}

  async getVotes(user: ParsedUserId): Promise<number> {
    const contract = this.contractService.getTokenContract(user.userChainId);
    const balance: BigNumber = await contract.getVotes(user.userAddress);
    const ether = utils.formatEther(balance);
    return +ether;
  }
}
