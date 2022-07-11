import Redis, { RedisOptions } from 'ioredis';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ApiUserConfig } from './api-user.types';
import { ApiUserConfigStorage } from './api-user-config-storage.interface';

@Injectable()
export class ApiUserConfigStorageRedisService implements ApiUserConfigStorage, OnModuleDestroy {
  redis: Redis;
  disconnectRequired?: boolean;

  constructor(redis?: Redis);
  constructor(options?: RedisOptions);
  constructor(url?: string);
  constructor(redisOrOptions?: Redis | RedisOptions | string) {
    if (redisOrOptions instanceof Redis) {
      this.redis = redisOrOptions;
    } else if (typeof redisOrOptions === 'string') {
      this.redis = new Redis(redisOrOptions);
      this.disconnectRequired = true;
    } else if (redisOrOptions) {
      this.redis = new Redis(redisOrOptions);
      this.disconnectRequired = true;
    } else {
      throw new Error('Redis connection is required');
    }
  }

  async getUser(userId: string): Promise<ApiUserConfig | undefined> {
    const value = await this.redis.get(userId);
    if (value) {
      try {
        const userConfig = JSON.parse(value) as ApiUserConfig;
        return userConfig;
      } catch (err) {
        return undefined;
      }
    }
    return undefined;
  }

  async setUser(userId: string, userConfig: ApiUserConfig) {
    const value = JSON.stringify(userConfig);
    await this.redis.set(userId, value);
  }

  onModuleDestroy() {
    if (this.disconnectRequired) {
      this.redis?.disconnect(false);
    }
  }
}
