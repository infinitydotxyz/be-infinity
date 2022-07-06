import { ChainId } from '@infinityxyz/lib/types/core';
import { GOERLI_INFINITY_TOKEN_ADDRESS } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { infinityTokenAbi } from 'abi/infinityContract';
import { EthereumService } from './ethereum.service';

@Injectable()
export class ContractService {
  constructor(private ethereumService: EthereumService) {}

  getTokenContract(chainId: string | ChainId) {
    return this.ethereumService.getContract({
      abi: infinityTokenAbi,
      address: GOERLI_INFINITY_TOKEN_ADDRESS,
      chainId: chainId
    });
  }
}
