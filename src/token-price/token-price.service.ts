import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { Injectable } from '@nestjs/common';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { TokenPairFactory } from './models/token-pair-factory';

@Injectable()
export class TokenPriceService {
  constructor(private firebaseService: FirebaseService, private ethereumService: EthereumService) {}

  async getTokenPrice(
    tokenAddress: string,
    tokenChainId: ChainId,
    decimals: number,
    symbol: string,
    name: string,
    blockNumber?: number
  ) {
    const provider = this.ethereumService.getProvider(ChainId.Mainnet);
    const factory = new TokenPairFactory(this.firebaseService.firestore, provider);
    const tokenPair = factory.create(tokenAddress, tokenChainId, decimals, symbol, name);
    const price = await tokenPair.getTokenPrice(blockNumber);
    const res = {
      price,
      tokenPerOther: price.token0.address === tokenAddress ? price.token0PriceNum : price.token1PriceNum,
      otherPerToken: price.token0.address === tokenAddress ? price.token1PriceNum : price.token0PriceNum
    };
    return res;
  }
}
