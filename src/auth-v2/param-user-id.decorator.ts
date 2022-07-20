import { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common/decorators';

export const ParamUserId = createParamDecorator((paramKey: string, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest();
  const param = request.params[paramKey];
  return param;
});
