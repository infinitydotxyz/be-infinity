import { Module } from '@nestjs/common';
import { FlurService } from './flur.service';

@Module({
  providers: [FlurService]
})
export class FlurModule {}
