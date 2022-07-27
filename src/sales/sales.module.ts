import { Module } from '@nestjs/common';
import { PaginationModule } from 'pagination/pagination.module';
import { SalesController } from './sales.controller';
import SalesService from './sales.service';

@Module({
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
  imports: [PaginationModule]
})
export class SalesModule {}
