import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation
} from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { ResponseDescription } from 'common/response-description';
import { FeedService } from './feed.service';
import { IncrementQuery } from './feed.types';
import { Get, Query, UseInterceptors } from '@nestjs/common';
import { NftActivityArrayDto, NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';

@Controller('feed')
export class FeedController {
  constructor(private feedService: FeedService) {}

  @Post('/:userId/like')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
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

  @Get('activity')
  @ApiOperation({
    description: 'Get activity',
    tags: [ApiTag.Nft]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftActivityArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 2 }))
  async getCollectionActivity(@Query() filters: NftActivityFiltersDto) {
    const { data, cursor, hasNextPage } = await this.feedService.getActivity(filters);

    return {
      data,
      cursor,
      hasNextPage
    };
  }
}
