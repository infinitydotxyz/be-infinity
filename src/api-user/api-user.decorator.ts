import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiUserConfig, ApiUserConfigKeys } from './api-user.types';

export const ApiUser = createParamDecorator<
  ApiUserConfigKeys | undefined,
  ExecutionContext,
  ApiUserConfig[ApiUserConfigKeys] | ApiUserConfig
>((data: ApiUserConfigKeys | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.apiUser as ApiUserConfig;
  return data ? user[data] : user;
});
