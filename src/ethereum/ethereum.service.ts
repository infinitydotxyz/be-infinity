import { ChainId, Erc20TokenMetadata } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils/formatters';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { Contract, ethers } from 'ethers';
import { ERC721ABI } from '@infinityxyz/lib/abi/erc721';
import { TokenPair } from './token-price/token-pair';
import { EnvironmentVariables } from '../types/environment-variables.interface';
import { CachedTokenPair } from './token-price/cached-token-pair';
import { Token } from '@uniswap/sdk-core';
import { USDC_MAINNET, WETH_MAINNET } from './token-price/constants';
import { FirebaseService } from 'firebase/firebase.service';

@Injectable()
export class EthereumService {
  private _providers: Map<ChainId, ethers.providers.StaticJsonRpcProvider> = new Map();

  constructor(
    private configService: ConfigService<EnvironmentVariables, true>,
    private firebaseService: FirebaseService
  ) {
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

  getProvider(chainId: ChainId) {
    const provider = this._providers.get(chainId);
    if (!provider) {
      throw new Error(`Provider is not configured for chainId: ${chainId}`);
    }

    return provider;
  }

  async getCurrentBlock(chainId: ChainId): Promise<ethers.providers.Block> {
    const provider = this.getProvider(chainId);
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    return block;
  }

  async getCurrentBlockNumber(chainId: ChainId): Promise<number> {
    const provider = this.getProvider(chainId);
    const blockNumber = await provider.getBlockNumber();
    return blockNumber;
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

  async getEthPrice() {
    const tokenPrice = await this.getTokenPairPrice(WETH_MAINNET, USDC_MAINNET);

    return tokenPrice.token1PerToken0;
  }

  protected async getTokenPairPrice(_token0: Erc20TokenMetadata, _token1: Erc20TokenMetadata, blockNumber?: number) {
    if (_token0.chainId !== ChainId.Mainnet) {
      throw new Error(`Token not yet supported ${_token0.chainId} ${_token0.address}`);
    }
    const provider = this.getProvider(_token0.chainId);
    const chainIdInt = parseInt(_token0.chainId, 10);
    const token0 = new Token(chainIdInt, _token0.address, _token0.decimals, _token0.symbol, _token0.name);
    const token1 = new Token(chainIdInt, _token1.address, _token1.decimals, _token1.symbol, _token1.name);
    const tokenPair = new TokenPair(token0, token1, provider);
    const cachedTokenPair = new CachedTokenPair(this.firebaseService.firestore, tokenPair);
    const price = await cachedTokenPair.getTokenPrice(blockNumber);
    const res = {
      price,
      tokenPerOther: price.token0.address === _token0.address ? price.token0PriceNum : price.token1PriceNum,
      otherPerToken: price.token0.address === _token0.address ? price.token1PriceNum : price.token0PriceNum
    };

    return {
      price: res.price,
      token1PerToken0: res.tokenPerOther,
      token0PerToken1: res.otherPerToken
    };
  }
}
