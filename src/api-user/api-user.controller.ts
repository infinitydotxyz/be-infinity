import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Auth } from 'auth-v2/api-auth.decorator';
import { ApiRole, ApiRoleHierarchy, SiteRole } from 'auth-v2/auth.constants';
import { AuthException } from 'auth-v2/auth.exception';
import { ResponseDescription } from 'common/response-description';
import { ApiUser } from './api-user.decorator';
import { ApiUserService } from './api-user.service';
import { ApiUser as IApiUser } from './api-user.types';

@Controller('apiUser')
export class ApiUserController {
  constructor(private apiUserService: ApiUserService) {}

  @Get('/')
  @ApiOperation({
    description: "Get the authenticated user's account details"
  })
  @Auth(SiteRole.Guest, ApiRole.ApiUser)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  getUser(@ApiUser() apiUser: IApiUser) {
    return apiUser;
  }

  @Post('/')
  @ApiOperation({
    description: 'Create a new user'
  })
  @Auth(SiteRole.Guest, ApiRole.ApiAdmin)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async createUser(@ApiUser() apiUser: IApiUser, @Body() body: any) {
    const name = body.name;
    const res = await this.apiUserService.createApiUser({
      name,
      config: {
        role: ApiRole.ApiUser,
        global: {
          ttl: 60,
          limit: 100
        }
      }
    });

    return res;
  }

  @Get('/:id')
  @ApiOperation({
    description: "Get a specific user's account"
  })
  @Auth(SiteRole.Guest, ApiRole.ApiAdmin)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserById(@Param('id') userApiKey: string) {
    const res = await this.apiUserService.getUser(userApiKey);
    return res;
  }

  @Put('/:id/reset')
  @ApiOperation({
    description: "Reset a user's api secret"
  })
  @Auth(SiteRole.Guest, ApiRole.ApiUser)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async resetUserApiSecret(@ApiUser() authenticatedUser: IApiUser, @Param('id') userToReset: string) {
    const isResettingOwnApiKey = authenticatedUser.id === userToReset;
    const isAdmin = ApiRoleHierarchy[authenticatedUser.config.role] >= ApiRoleHierarchy[ApiRole.ApiAdmin];
    if (!isResettingOwnApiKey && !isAdmin) {
      throw new AuthException('Invalid permissions');
    }
    const res = await this.apiUserService.resetApiSecret(userToReset);
    return res;
  }
}
