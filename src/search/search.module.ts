import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PaginationModule } from 'pagination/pagination.module';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { ReservoirService } from 'reservoir/reservoir.service';

@Module({
  providers: [SearchService, ReservoirService],
  imports: [PaginationModule, ReservoirModule],
  controllers: [SearchController]
})
export class SearchModule {}
