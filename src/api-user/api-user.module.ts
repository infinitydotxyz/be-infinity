import { Module } from '@nestjs/common';
import { ApiUserConfigStorageRedisService } from './api-user-config-storage.service';
import { ApiUserController } from './api-user.controller';
import { ApiUserService } from './api-user.service';

@Module({
  controllers: [ApiUserController],
  providers: [ApiUserConfigStorageRedisService, ApiUserService],
  exports: [ApiUserService]
})
export class ApiUserModule {}
