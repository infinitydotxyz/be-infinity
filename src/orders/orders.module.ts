import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { CollectionsModule } from 'collections/collections.module';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { UserModule } from 'user/user.module';
import { OrdersController } from './orders.controller';
import { UserOrdersController } from './user-orders/user-orders.controller';
import { UserOrdersService } from './user-orders/user-orders.service';
import { BaseOrdersService } from './base-orders/base-orders.service';
import OrdersService from './orders.service';

@Module({
  providers: [OrdersService, UserOrdersService, BaseOrdersService],
  controllers: [OrdersController, UserOrdersController],
  exports: [OrdersService],
  imports: [UserModule, AuthModule, CollectionsModule, EthereumModule, PaginationModule]
})
export class OrdersModule {}
