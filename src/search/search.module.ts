import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PaginationModule } from 'pagination/pagination.module';

@Module({
  providers: [SearchService],
  imports: [PaginationModule],
  controllers: [SearchController]
})
export class SearchModule {}
