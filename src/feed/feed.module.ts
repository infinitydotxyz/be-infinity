import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  providers: [FeedService],
  exports: [FeedService],
  controllers: [FeedController]
})
export class FeedModule {}
