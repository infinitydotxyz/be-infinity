import { Module } from '@nestjs/common';
import { UserParserModule } from 'user/parser/parser.module';
import { OrdersModule } from 'v2/orders/orders.module';
import { UsersController } from './users.controller';
import { BetaModule } from 'v2/beta/beta.module';
import { AuthModule } from 'auth/auth.module';

@Module({
  controllers: [UsersController],
  imports: [OrdersModule, UserParserModule, BetaModule, AuthModule]
})
export class UsersModule {}
