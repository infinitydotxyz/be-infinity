import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiUser as ApiUserType, ApiUserKeys } from './api-user.types';

export const ApiUser = createParamDecorator<
  ApiUserKeys | undefined,
  ExecutionContext,
  ApiUserType[ApiUserKeys] | ApiUserType
>((data: ApiUserKeys | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.apiUser as ApiUserType;
  return data ? user[data] : user;
});
