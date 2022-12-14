import { Module } from '@nestjs/common';
import { OrdersModule } from 'v2/orders/orders.module';
import { GenerateController } from './generate.controller';

@Module({
  controllers: [GenerateController],
  imports: [OrdersModule]
})
export class GenerateModule {}
