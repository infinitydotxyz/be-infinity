import { SubQueryDto } from '@infinityxyz/lib/types/dto';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { SearchService } from './search.service';

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
  @Throttle(10, 1)
  async search(@Query() search: SubQueryDto<any, any, any>) {
    const res = await this.searchService.search(search);
    return res;
  }
}
