import { ChainId } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { BigNumberish, BigNumber } from 'ethers';

@Injectable()
export class CmDistributorContractService {
  constructor(private contractService: ContractService) {}

  async getCumulativeETHClaimed(chainId: ChainId, address: string) {
    const contract = this.contractService.getCmDistributor(chainId);
    const amountClaimed = (await contract.cumulativeEthClaimed(address)) as BigNumberish;

    return BigNumber.from(amountClaimed).toString();
  }

  // async getCumulativeINFTClaimed(chainId: ChainId, address: string) {
  //   const contract = this.contractService.getCmDistributor(chainId);
  //   const amountClaimed = (await contract.cumulativeINFTClaimed(address)) as BigNumberish;

  //   return BigNumber.from(amountClaimed).toString();
  // }

  async getCumulativeFLURClaimed(chainId: ChainId, address: string) {
    const contract = this.contractService.getCmDistributor(chainId);
    const flurTokenAddress = this.contractService.getFlurTokenContract(chainId).address;
    const amountClaimed = (await contract.cumulativeErc20Claimed(flurTokenAddress, address)) as BigNumberish;
    return BigNumber.from(amountClaimed).toString();
  }

  async getCumulativeFLOWClaimed(chainId: ChainId, address: string) {
    const contract = this.contractService.getCmDistributor(chainId);
    const flowTokenAddress = this.contractService.getTokenContract(chainId).address;
    const amountClaimed = (await contract.cumulativeErc20Claimed(address, flowTokenAddress)) as BigNumberish;

    return BigNumber.from(amountClaimed).toString();
  }

  getAddress(chainId: ChainId) {
    return this.contractService.getCmDistributorAddress(chainId);
  }
}
