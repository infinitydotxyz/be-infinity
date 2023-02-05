import { Module } from '@nestjs/common';
import { ApiUserModule } from 'api-user/api-user.module';
import { OrdersModule } from 'v2/orders/orders.module';
import { BulkController } from './bulk.controller';

@Module({
  controllers: [BulkController],
  imports: [OrdersModule, ApiUserModule]
})
export class BulkModule {}
