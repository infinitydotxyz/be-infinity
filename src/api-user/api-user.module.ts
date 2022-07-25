import { Module } from '@nestjs/common';
import { ApiUserConfigStorageFirebase } from './api-user-config-storage-firebase.service';
import { ApiUserController } from './api-user.controller';
import { ApiUserService } from './api-user.service';

@Module({
  controllers: [ApiUserController],
  providers: [ApiUserService, ApiUserConfigStorageFirebase],
  exports: [ApiUserService, ApiUserConfigStorageFirebase]
})
export class ApiUserModule {}
