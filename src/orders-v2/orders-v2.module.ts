import { Module } from '@nestjs/common';
import { OrdersV2Controller } from './orders-v2.controller';
import { EthereumModule } from 'ethereum/ethereum.module';
import { NonceService } from './nonce/nonce.service';
import { BaseOrdersService } from './base-orders.service';

@Module({
  controllers: [OrdersV2Controller],
  imports: [EthereumModule],
  providers: [NonceService, BaseOrdersService]
})
export class OrdersV2Module {}
