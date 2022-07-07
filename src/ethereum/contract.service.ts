import { ChainId } from '@infinityxyz/lib/types/core';
import { ETHEREUM_INFINITY_EXCHANGE_ADDRESS } from '@infinityxyz/lib/utils';
import { ERC20ABI } from '@infinityxyz/lib/abi/erc20';
import { Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum.service';

@Injectable()
export class ContractService {
  constructor(private ethereumService: EthereumService) {}

  getTokenContract(chainId: string | ChainId) {
    return this.ethereumService.getContract({
      abi: ERC20ABI,
      address: ETHEREUM_INFINITY_EXCHANGE_ADDRESS,
      chainId: chainId
    });
  }
}
