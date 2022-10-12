import { ChainId } from '@infinityxyz/lib/types/core';
import { ERC20ABI } from '@infinityxyz/lib/abi/erc20';
import { InfinityCmDistributorABI } from '@infinityxyz/lib/abi/infinityCmDistributor';
import { getCmDistributorAddress, getStakerAddress, getTokenAddress, NULL_ADDRESS } from '@infinityxyz/lib/utils';
import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { BadRequestException, Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum.service';
import { BigNumber, utils } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from 'types/environment-variables.interface';

@Injectable()
export class ContractService {
  constructor(private ethereumService: EthereumService, private configService: ConfigService<EnvironmentVariables>) {}

  /**
   * Convert a balance in GWEI to ETH.
   * @param balance
   * @returns
   */
  toEther(balance: BigNumber) {
    const ether = utils.formatEther(balance);
    return +ether;
  }

  getStakerContract(chainId: string | ChainId) {
    const stakerContractAddress = this.getStakerAddress(chainId as ChainId);
    this._assertSupportedAddress(stakerContractAddress, chainId as ChainId);

    return this.ethereumService.getContract({
      abi: InfinityStakerABI,
      address: stakerContractAddress,
      chainId: chainId
    });
  }

  getTokenContract(chainId: string | ChainId) {
    const env = this.configService.get('INFINITY_NODE_ENV');
    const tokenAddress = getTokenAddress(chainId as ChainId, env);
    this._assertSupportedAddress(tokenAddress, chainId as ChainId);

    return this.ethereumService.getContract({
      abi: ERC20ABI,
      address: tokenAddress,
      chainId: chainId
    });
  }

  getStakerAddress(chainId: ChainId) {
    const env = this.configService.get('INFINITY_NODE_ENV');
    const stakingContract = getStakerAddress(chainId, env);
    return stakingContract;
  }

  getCmDistributorAddress(chainId: ChainId) {
    const env = this.configService.get('INFINITY_NODE_ENV');
    const address = getCmDistributorAddress(chainId, env);
    return address;
  }

  getCmDistributor(chainId: ChainId) {
    const address = this.getCmDistributorAddress(chainId);
    this._assertSupportedAddress(address, chainId);

    return this.ethereumService.getContract({
      abi: InfinityCmDistributorABI,
      address,
      chainId
    });
  }

  protected _assertSupportedAddress(contractAddress: string, chainId: ChainId) {
    if (!contractAddress || contractAddress === NULL_ADDRESS) {
      throw new BadRequestException(`Chain id ${chainId} is currently not supported!`);
    }
  }
}
