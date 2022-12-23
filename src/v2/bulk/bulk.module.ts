import { Module } from '@nestjs/common';
import { OrdersModule } from 'v2/orders/orders.module';
import { BulkController } from './bulk.controller';

@Module({
  controllers: [BulkController],
  imports: [OrdersModule]
})
export class BulkModule {}
