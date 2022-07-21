import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiUserKeys } from './api-user.types';
import { ApiUserDto } from './dto/api-user.dto';

export const ApiUser = createParamDecorator<
  ApiUserKeys | undefined,
  ExecutionContext,
  ApiUserDto[ApiUserKeys] | ApiUserDto
>((data: ApiUserKeys | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.apiUser as ApiUserDto;
  return data ? user[data] : user;
});
