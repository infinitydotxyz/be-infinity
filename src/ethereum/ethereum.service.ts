import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { Contract, ethers } from 'ethers';
import { ERC721ABI } from '@infinityxyz/lib/abi/erc721';
import { EnvironmentVariables } from '../types/environment-variables.interface';

@Injectable()
export class EthereumService {
  private _providers: Map<ChainId, ethers.providers.StaticJsonRpcProvider> = new Map();

  constructor(private configService: ConfigService<EnvironmentVariables>) {
    const mainnetUrl = this.configService.get('alchemyJsonRpcEthMainnet');
    const polygonUrl = this.configService.get('alchemyJsonRpcPolygonMainnet');
    const goerliUrl = this.configService.get('alchemyJsonRpcEthGoerli');
    const providerUrlByChainId = {
      [ChainId.Mainnet]: mainnetUrl,
      [ChainId.Polygon]: polygonUrl,
      [ChainId.Goerli]: goerliUrl
    };

    for (const chainId of Object.values(ChainId)) {
      const providerUrl = providerUrlByChainId[chainId];
      if (!providerUrl) {
        throw new Error(`Provider is not configured for chainId: ${chainId}`);
      }
      this._providers.set(chainId, new ethers.providers.StaticJsonRpcProvider(providerUrl));
    }
  }

  private getProvider(chainId: ChainId) {
    const provider = this._providers.get(chainId);
    if (!provider) {
      throw new Error(`Provider is not configured for chainId: ${chainId}`);
    }

    return provider;
  }

  async getErc721Owner(token: { address: string; tokenId: string; chainId: string }): Promise<string> {
    try {
      const provider = this.getProvider(token.chainId as ChainId);
      const contract = new ethers.Contract(token.address, ERC721ABI, provider);
      const owner = trimLowerCase(await contract.ownerOf(token.tokenId));
      return owner;
    } catch (err) {
      console.error(err);
      return '';
    }
  }

  getContract(contract: { address: string; chainId: string; abi: ethers.ContractInterface }) {
    const provider = this.getProvider(contract.chainId as ChainId);
    return new Contract(contract.address, contract.abi, provider);
  }
}
