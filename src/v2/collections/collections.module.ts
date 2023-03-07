import { Module } from '@nestjs/common';
import { OrdersModule } from 'v2/orders/orders.module';
import { CollectionsController } from './collections.controller';
import { TokensController } from './tokens/tokens.controller';
import { MatchingEngineModule } from 'v2/matching-engine/matching-engine.module';

@Module({
  controllers: [CollectionsController, TokensController],
  imports: [OrdersModule, MatchingEngineModule]
})
export class CollectionsModule {}
