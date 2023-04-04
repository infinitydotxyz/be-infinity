import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';

@Module({
  providers: [
    {
      inject: ['REDIS_OPTIONS'],
      provide: 'REDIS_CLIENT',
      useFactory: (options: { url: string }) => {
        const client = new Redis(options.url);
        return client;
      }
    }
  ],
  exports: ['REDIS_CLIENT']
})
export class RedisModule {}
