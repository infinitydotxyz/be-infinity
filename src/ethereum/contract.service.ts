import { ChainId } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { infinityTokenAbi } from 'abi/infinityContract';
import { EthereumService } from './ethereum.service';

@Injectable()
export class ContractService {
  constructor(private ethereumService: EthereumService) {}

  getTokenContract(chainId: string | ChainId) {
    return this.ethereumService.getContract({
      abi: infinityTokenAbi,
      address: '0x2BDB98086d47e38e3A40B42463Af005F5CF72146',
      chainId: chainId
    });
  }
}
