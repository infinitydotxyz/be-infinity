import { Controller, Get } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ResponseDescription } from 'common/response-description';
import { ApiUser } from './api-user.decorator';
import { ApiUserService } from './api-user.service';
import { ApiUserConfig } from './api-user.types';

@Controller('api-user')
export class ApiUserController {
  constructor(private apiUserService: ApiUserService) {}

  @Get('/')
  @ApiOperation({
    description: 'Get user info'
  })
  // TODO add auth
  @ApiOkResponse({ description: ResponseDescription.Success }) // TODO add type
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUser(@ApiUser() apiUser: ApiUserConfig) {
    console.log(apiUser);
    await new Promise<void>((resolve, reject) => resolve());
    return {};
  }
}
