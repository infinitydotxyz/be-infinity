import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { Searches, SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(protected searchService: SearchService) {}

  @Get()
  @ApiOperation({
    description: 'Advanced search',
    tags: [ApiTag.Collection]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @Throttle(10, 1) // 10 reqs per second; overrides global config
  async search(@Query() search: Searches) {
    console.log(search);
    const limit = parseInt(`${search.limit}`, 10);
    search.limit = limit;
    const res = await this.searchService.search(search);
    return res;
  }
}
