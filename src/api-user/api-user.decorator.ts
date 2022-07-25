import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiUserKeys } from './api-user.types';

export const ApiUser = createParamDecorator<
  ApiUserKeys | undefined,
  ExecutionContext,
  ApiUserDto[ApiUserKeys] | ApiUserDto
>((data: ApiUserKeys | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.apiUser as ApiUserDto;
  return data ? user[data] : user;
});
