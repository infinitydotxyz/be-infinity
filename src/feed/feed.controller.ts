import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation
} from '@nestjs/swagger';
import { UserAuth } from 'auth/user-auth.decorator';

import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { ResponseDescription } from 'common/response-description';
import { FeedService } from './feed.service';
import { IncrementQuery } from './feed.types';

@Controller('feed')
export class FeedController {
  constructor(private feedService: FeedService) {}

  @Post('/:userId/like')
  @UserAuth('userId')
  @ApiOperation({
    description: 'Increment likes',
    tags: [ApiTag.Feed]
  })
  @ApiOkResponse({ type: Boolean })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  public async incrementLikes(@Body() payload: IncrementQuery) {
    await this.feedService.incrementLikes(payload);

    return true;
  }
}
