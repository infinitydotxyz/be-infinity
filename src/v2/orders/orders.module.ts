import { Module } from '@nestjs/common';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { BaseOrdersService } from './base-orders.service';
import { GenerateOrderService } from './generate-order/generate-order.service';
import { NonceService } from './nonce/nonce.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ProtocolOrdersService } from './protocol-orders/protocol-orders.service';

@Module({
  controllers: [OrdersController],
  imports: [EthereumModule, PaginationModule],
  providers: [NonceService, BaseOrdersService, OrdersService, ProtocolOrdersService, GenerateOrderService],
  exports: [GenerateOrderService, ProtocolOrdersService, OrdersService]
})
export class OrdersModule {}
