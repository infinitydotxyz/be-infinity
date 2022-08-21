import { Module } from '@nestjs/common';
import { PaginationModule } from 'pagination/pagination.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  providers: [FeedService],
  exports: [FeedService],
  controllers: [FeedController],
  imports: [PaginationModule]
})
export class FeedModule {}
