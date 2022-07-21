import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import {
  ApiUserDto,
  AdminUpdateApiUserDto,
  PartialAdminUpdateApiUserDto,
  ApiUserPublicWithCredsDto,
  ApiUserPublicDto
} from '@infinityxyz/lib/types/dto/api-user';
import { Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { AuthException } from 'auth/auth.exception';
import { ResponseDescription } from 'common/response-description';
import { stripProperties } from 'utils/strip-properties';
import { ApiUser } from './api-user.decorator';
import { ApiUserService } from './api-user.service';
import { hasApiRole, roleAtLeast } from './api-user.utils';

@Controller('apiUser')
export class ApiUserController {
  constructor(private apiUserService: ApiUserService) {}

  @Post('/')
  @ApiOperation({
    description: 'Create a new user'
  })
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicWithCredsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async createUser(@Body() body: AdminUpdateApiUserDto): Promise<ApiUserPublicWithCredsDto> {
    const name = body.name;
    const res = await this.apiUserService.createApiUser({
      name,
      config: body.config
    });
    const { result } = await stripProperties(ApiUserPublicWithCredsDto, res);
    return result;
  }

  @Get('/:id')
  @ApiOperation({
    description: "Get a specific user's account"
  })
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserById(@Param('id') userApiKey: string): Promise<ApiUserPublicDto> {
    const res = await this.apiUserService.getUser(userApiKey);
    if (!res) {
      throw new NotFoundException('User not found');
    }
    const { result } = await stripProperties(ApiUserPublicDto, res);
    return result;
  }

  @Put('/:id/reset')
  @ApiOperation({
    description: "Reset a user's api secret"
  })
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicWithCredsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async resetUserApiSecret(
    @ApiUser() authenticatedUser: ApiUserDto,
    @Param('id') userToReset: string
  ): Promise<ApiUserPublicWithCredsDto> {
    const isResettingOwnApiKey = authenticatedUser.id === userToReset;
    const isAdmin = hasApiRole(authenticatedUser.config.role, ApiRole.Admin);
    if (!isResettingOwnApiKey && !isAdmin) {
      throw new AuthException('Invalid permissions');
    }
    const res = await this.apiUserService.resetApiSecret(userToReset);
    if (!res) {
      throw new NotFoundException('User not found');
    }
    const { result } = await stripProperties(ApiUserPublicWithCredsDto, res);
    return result;
  }

  @Put('/:id')
  @ApiOperation({
    description: "Update a user's account as the admin"
  })
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async adminUpdateUser(
    @Body() body: PartialAdminUpdateApiUserDto,
    @Param('id') userId: string,
    @ApiUser() authenticatedUser: ApiUserDto
  ): Promise<ApiUserPublicDto> {
    /**
     * must be at least one role above the role to set
     * or a super admin
     */
    if (
      body.config?.role &&
      authenticatedUser.config.role !== ApiRole.SuperAdmin &&
      !roleAtLeast(authenticatedUser.config.role, { role: body.config.role, plus: 1 })
    ) {
      throw new AuthException('Invalid permissions');
    }

    const currentUser = await this.apiUserService.getUser(userId);

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    /**
     * must be at least one role above the user's role
     * or a super admin
     */
    if (
      authenticatedUser.config.role !== ApiRole.SuperAdmin &&
      !roleAtLeast(authenticatedUser.config.role, { role: currentUser.config.role, plus: 1 })
    ) {
      throw new AuthException('Invalid permissions');
    }

    const res = await this.apiUserService.updateApiUser(userId, body);
    if (!res) {
      throw new NotFoundException('User not found');
    }
    const { result } = await stripProperties(ApiUserPublicDto, res);
    return result;
  }
}
