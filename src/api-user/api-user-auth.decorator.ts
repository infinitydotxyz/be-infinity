import { UseGuards } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common/decorators/core/apply-decorators';
import { ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ResponseDescription } from 'common/response-description';
import { API_KEY_HEADER, API_SECRET_HEADER } from './api-auth.constants';
import { ApiAuth } from './api-auth.decorator';
import { ApiAuthGuard } from './api-auth.guard';
import { ApiUserRole } from './api-user.types';

export function UserApiAuth() {
  return applyDecorators(ApiSecurity(API_KEY_HEADER), ApiSecurity(API_SECRET_HEADER));
}

export function ApiUserAuth(roleRequired: ApiUserRole) {
  return applyDecorators(
    UserApiAuth(),
    ApiUnauthorizedResponse({ description: ResponseDescription.Unauthorized }),
    UseGuards(ApiAuthGuard),
    ApiAuth(roleRequired)
  );
}
