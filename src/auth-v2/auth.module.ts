import { Module } from '@nestjs/common';
import { Global } from '@nestjs/common/decorators/modules/global.decorator';
import { ApiUserModule } from 'api-user/api-user.module';
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
  providers: [UserParserService, AuthGuard],
  exports: [UserParserService],
  imports: [UserParserModule, UserModule, ApiUserModule]
})
export class AuthModule {}
