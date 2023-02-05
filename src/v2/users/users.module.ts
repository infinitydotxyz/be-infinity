import { Module } from '@nestjs/common';
import { UserParserModule } from 'user/parser/parser.module';
import { OrdersModule } from 'v2/orders/orders.module';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  imports: [OrdersModule, UserParserModule]
})
export class UsersModule {}
