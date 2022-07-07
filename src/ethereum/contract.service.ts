import { ChainId } from '@infinityxyz/lib/types/core';
import { GOERLI_STAKER_CONTRACT_ADDRESS } from '@infinityxyz/lib/utils';
import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum.service';

@Injectable()
export class ContractService {
  constructor(private ethereumService: EthereumService) {}

  getStakerContract(chainId: string | ChainId) {
    return this.ethereumService.getContract({
      abi: InfinityStakerABI,
      address: GOERLI_STAKER_CONTRACT_ADDRESS,
      chainId: ChainId.Goerli // chainId
    });
  }
}
