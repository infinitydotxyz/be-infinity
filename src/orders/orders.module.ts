import { Module } from '@nestjs/common';
import { AuthModule } from 'auth-v2/auth.module';
import { CollectionsModule } from 'collections/collections.module';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { UserModule } from 'user/user.module';
import { OrdersController } from './orders.controller';
import OrdersService from './orders.service';

@Module({
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
  imports: [UserModule, AuthModule, CollectionsModule, EthereumModule, PaginationModule]
})
export class OrdersModule {}
