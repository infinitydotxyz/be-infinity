import { Module } from '@nestjs/common';
import { EthereumModule } from 'ethereum/ethereum.module';
import { TokenPriceService } from './token-price.service';

@Module({
  providers: [TokenPriceService],
  imports: [EthereumModule]
})
export class TokenPriceModule {}
