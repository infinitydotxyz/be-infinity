import { Module } from '@nestjs/common';
import { OrdersV2Controller } from './orders-v2.controller';
import { EthereumModule } from 'ethereum/ethereum.module';
import { NonceService } from './nonce/nonce.service';
import { BaseOrdersService } from './base-orders.service';
import { OrdersV2Service } from './orders-v2.service';
import { PaginationModule } from 'pagination/pagination.module';
import { ProtocolOrdersService } from './protocol-orders/protocol-orders.service';
import { GenerateOrderService } from './generate-order/generate-order.service';

@Module({
  controllers: [OrdersV2Controller],
  imports: [EthereumModule, PaginationModule],
  providers: [NonceService, BaseOrdersService, OrdersV2Service, ProtocolOrdersService, GenerateOrderService],
  exports: [OrdersV2Service]
})
export class OrdersV2Module {}
