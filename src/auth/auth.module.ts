import { Module } from '@nestjs/common';
import { Global } from '@nestjs/common/decorators/modules/global.decorator';
import { ApiUserModule } from 'api-user/api-user.module';
import { ApiUserService } from 'api-user/api-user.service';
import { UserParserModule } from 'user/parser/parser.module';
import { UserParserService } from 'user/parser/parser.service';
import { UserModule } from 'user/user.module';
import { AuthGuard } from './auth.guard';

/**
 * Global authentication module.
 *
 * This module re-exports the dependencies that are required in `AuthGuard`.
 */
@Global()
@Module({
  providers: [UserParserService, ApiUserService, AuthGuard],
  exports: [UserParserService, ApiUserService],
  imports: [UserParserModule, UserModule, ApiUserModule]
})
export class AuthModule {}
