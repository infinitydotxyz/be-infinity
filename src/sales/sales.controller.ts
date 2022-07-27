import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { ResponseDescription } from 'common/response-description';
import SalesService from './sales.service';
import { InfinitySalesQueryDto, SalesResponse } from './sales.types';

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Get()
  @ApiOperation({
    description: 'Fetches Infinity sales',
    tags: [ApiTag.Sales]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: SalesResponse })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getInfinitySales(@Query() reqQuery: InfinitySalesQueryDto): Promise<SalesResponse> {
    const results = await this.salesService.getInfinitySales(reqQuery.cursor ?? '', reqQuery.limit ?? 100);
    return results;
  }
}
