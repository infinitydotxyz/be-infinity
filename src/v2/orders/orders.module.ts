import { Module } from '@nestjs/common';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { BaseOrdersService } from './base-orders.service';
import { GenerateOrderService } from './generate-order/generate-order.service';
import { NonceService } from './nonce/nonce.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ProtocolOrdersService } from './protocol-orders/protocol-orders.service';
import { MatchingEngineModule } from 'v2/matching-engine/matching-engine.module';
import { ReservoirService } from 'reservoir/reservoir.service';

@Module({
  controllers: [OrdersController],
  imports: [EthereumModule, PaginationModule, MatchingEngineModule],
  providers: [
    NonceService,
    BaseOrdersService,
    OrdersService,
    ProtocolOrdersService,
    GenerateOrderService,
    ReservoirService
  ],
  exports: [GenerateOrderService, ProtocolOrdersService, OrdersService]
})
export class OrdersModule {}
