import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_AUTH_ROLE, API_KEY_HEADER, API_SECRET_HEADER } from './api-auth.constants';
import { ApiAuthException } from './api-auth.exception';
import { ApiUserService } from './api-user.service';
import { ApiUserRole, RoleHierarchy } from './api-user.types';

export class ApiAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private apiUserService: ApiUserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();

    const rolesRequired = this.reflector.getAllAndOverride<ApiUserRole[]>(API_AUTH_ROLE, [handler, classRef]);

    if (rolesRequired.length === 0) {
      return true;
    }

    return this.handleRequest(context, rolesRequired);
  }

  protected async handleRequest(context: ExecutionContext, rolesRequired: ApiUserRole[]): Promise<boolean> {
    const { req } = this.getRequestResponse(context);

    const apiKey = req.headers[API_KEY_HEADER];
    const apiSecret = req.headers[API_SECRET_HEADER];

    if (!apiKey || !apiSecret) {
      throw new ApiAuthException('Missing api key or api secret');
    }

    const result = await this.apiUserService.verifyAndGetUserConfig(apiKey, apiSecret);
    if (!result.isValid) {
      throw new ApiAuthException(result.reason);
    }

    const userRole = result.userConfig.role;
    if (!this.userAtLeastRole(userRole, rolesRequired)) {
      throw new ApiAuthException('User does not have the required role');
    }

    return true;
  }

  protected userAtLeastRole(userRole: ApiUserRole, rolesRequired: ApiUserRole[]): boolean {
    const role = RoleHierarchy[userRole];
    return rolesRequired.every((requiredRole) => role >= RoleHierarchy[requiredRole]);
  }

  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, any>;
    res: Record<string, any>;
  } {
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
