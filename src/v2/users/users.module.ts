import { Module } from '@nestjs/common';
import { OrdersModule } from 'v2/orders/orders.module';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  imports: [OrdersModule]
})
export class UsersModule {}
