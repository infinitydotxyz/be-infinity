import { LoginNonceUserDto, RandomLoginNonceDto } from '@infinityxyz/lib/types/dto/user';
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('/nonce')
  @ApiOperation({
    description: 'Sends nonce for user login signature',
    tags: [ApiTag.Auth]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: RandomLoginNonceDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  getNonce(): RandomLoginNonceDto {
    return { nonce: Math.floor(Math.random() * 10000000) };
  }

  @Put('/nonce')
  @ApiOperation({
    description: 'Saves nonce and user',
    tags: [ApiTag.Auth]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async saveNonce(@Body() data: LoginNonceUserDto): Promise<void> {
    try {
      await this.authService.saveUserNonce(data.user, data.nonce);
      return;
    } catch (err) {
      console.error('Error saving login info', err);
      throw err;
    }
  }
}
