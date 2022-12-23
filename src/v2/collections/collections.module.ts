import { Module } from '@nestjs/common';
import { OrdersModule } from 'v2/orders/orders.module';
import { CollectionsController } from './collections.controller';
import { TokensController } from './tokens/tokens.controller';

@Module({
  controllers: [CollectionsController, TokensController],
  imports: [OrdersModule]
})
export class CollectionsModule {}
