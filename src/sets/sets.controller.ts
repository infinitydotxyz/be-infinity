import { SetsQuery, SetsResponse } from '@infinityxyz/lib/types/core';
import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import SetsService from './sets.service';

@Controller('sets')
export class SetsController {
  constructor(private setsService: SetsService) {}

  @Get()
  @ApiOperation({
    description: 'Fetches sets'
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 })) // 10 mins
  public async getSets(@Query() reqQuery: SetsQuery): Promise<SetsResponse> {
    const results = await this.setsService.getSets(reqQuery.minPrice ?? 0, reqQuery.maxPrice ?? 1);
    return results;
  }
}
