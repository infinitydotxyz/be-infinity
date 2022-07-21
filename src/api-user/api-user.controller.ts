import { Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { ApiRole, SiteRole } from 'auth/auth.constants';
import { AuthException } from 'auth/auth.exception';
import { ResponseDescription } from 'common/response-description';
import { ApiUser } from './api-user.decorator';
import { ApiUserService } from './api-user.service';
import { hasApiRole } from './api-user.utils';
import { ApiUserDto, ApiUserWithCredsDto } from './dto/api-user.dto';

@Controller('apiUser')
export class ApiUserController {
  constructor(private apiUserService: ApiUserService) {}

  @Get('/')
  @ApiOperation({
    description: "Get the authenticated user's account details"
  })
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  getUser(@ApiUser() apiUser: ApiUserDto): ApiUserDto {
    return apiUser;
  }

  @Post('/')
  @ApiOperation({
    description: 'Create a new user'
  })
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserWithCredsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async createUser(@Body() body: any): Promise<ApiUserWithCredsDto> {
    const name = body.name;
    const res = await this.apiUserService.createApiUser({
      name,
      config: {
        role: ApiRole.User,
        global: {
          ttl: 60, // TODO take from body
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
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserById(@Param('id') userApiKey: string): Promise<ApiUserDto> {
    const res = await this.apiUserService.getUser(userApiKey);
    if (!res) {
      throw new NotFoundException('User not found');
    }
    return res;
  }

  @Put('/:id/reset')
  @ApiOperation({
    description: "Reset a user's api secret"
  })
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiOkResponse({ description: ResponseDescription.Success, type: ApiUserWithCredsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async resetUserApiSecret(
    @ApiUser() authenticatedUser: ApiUserDto,
    @Param('id') userToReset: string
  ): Promise<ApiUserWithCredsDto> {
    const isResettingOwnApiKey = authenticatedUser.id === userToReset;
    const isAdmin = hasApiRole(authenticatedUser.config.role, ApiRole.Admin);
    if (!isResettingOwnApiKey && !isAdmin) {
      throw new AuthException('Invalid permissions');
    }
    const res = await this.apiUserService.resetApiSecret(userToReset);
    return res;
  }
}
