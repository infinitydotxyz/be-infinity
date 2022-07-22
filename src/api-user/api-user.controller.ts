import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import {
  ApiUserDto,
  AdminUpdateApiUserDto,
  PartialAdminUpdateApiUserDto,
  ApiUserPublicWithCredsDto,
  ApiUserPublicDto
} from '@infinityxyz/lib/types/dto/api-user';
import { Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam
} from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { AuthException } from 'auth/auth.exception';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { validateAndStrip } from 'utils/strip-properties';
import { ApiUser } from './api-user.decorator';
import { ApiUserService } from './api-user.service';
import { canUpdateOtherUser, hasApiRole } from './api-user.utils';

@Controller('apiUser')
export class ApiUserController {
  constructor(private apiUserService: ApiUserService) {}

  @Post('/')
  @ApiOperation({
    description: 'Create a new user',
    tags: [ApiTag.ApiUser]
  })
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicWithCredsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async createUser(
    @Body() body: AdminUpdateApiUserDto,
    @ApiUser() authenticatedUser: ApiUserDto
  ): Promise<ApiUserPublicWithCredsDto> {
    const name = body.name;

    /**
     * must be at least one role above the role to set
     * or a super admin
     */
    if (body.config?.role && !canUpdateOtherUser(authenticatedUser.config.role, body.config.role)) {
      throw new AuthException('Invalid permissions');
    }

    const res = await this.apiUserService.createApiUser({
      name,
      config: body.config
    });
    const { result } = await validateAndStrip(ApiUserPublicWithCredsDto, res);
    return result;
  }

  @Get('/:id')
  @ApiOperation({
    description: "Get a user's account",
    tags: [ApiTag.ApiUser]
  })
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiParam({ name: 'id', type: String, required: true, description: 'Api key of the user to get' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserById(
    @Param('id') userApiKey: string,
    @ApiUser() authenticatedUser: ApiUserDto
  ): Promise<ApiUserPublicDto> {
    if (authenticatedUser.id !== userApiKey && !hasApiRole(authenticatedUser.config.role, ApiRole.Admin)) {
      throw new AuthException('Invalid permissions');
    }
    const res = await this.apiUserService.getUser(userApiKey);
    if (!res) {
      throw new NotFoundException('User not found');
    }
    const { result } = await validateAndStrip(ApiUserPublicDto, res);
    return result;
  }

  @Put('/:id/reset')
  @ApiOperation({
    description: "Reset a user's api secret",
    tags: [ApiTag.ApiUser]
  })
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiParam({ name: 'id', type: String, required: true, description: 'Api key of the user to reset' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserPublicWithCredsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async resetUserApiSecret(
    @ApiUser() authenticatedUser: ApiUserDto,
    @Param('id') userToReset: string
  ): Promise<ApiUserPublicWithCredsDto> {
    const user = await this.apiUserService.getUser(userToReset);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isResettingOwnApiKey = authenticatedUser.id === userToReset;
    const canUpdateUser = canUpdateOtherUser(authenticatedUser.config.role, user.config.role);
    if (!isResettingOwnApiKey && !canUpdateUser) {
      throw new AuthException('Invalid permissions');
    }

    const res = await this.apiUserService.resetApiSecret(userToReset);
    if (!res) {
      throw new NotFoundException('User not found');
    }

    const { result } = await validateAndStrip(ApiUserPublicWithCredsDto, res);
    return result;
  }

  @Put('/:id')
  @ApiOperation({
    description: "Update a user's account as the admin",
    tags: [ApiTag.ApiUser]
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
    const currentUser = await this.apiUserService.getUser(userId);

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    const canUpdateToRole = !body.config?.role || canUpdateOtherUser(authenticatedUser.config.role, body.config.role);
    const canUpdateUser = canUpdateOtherUser(authenticatedUser.config.role, currentUser.config.role);
    if (!canUpdateToRole || !canUpdateUser) {
      throw new AuthException('Invalid permissions');
    }

    const res = await this.apiUserService.updateApiUser(userId, body);
    if (!res) {
      throw new NotFoundException('User not found');
    }
    const { result } = await validateAndStrip(ApiUserPublicDto, res);
    return result;
  }
}
