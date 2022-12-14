import { ApiRole } from '@infinityxyz/lib/types/core';
import { ErrorResponseDto } from '@infinityxyz/lib/types/dto';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { BulkOrderQuery } from 'v2/orders/bulk-query';
import { ProtocolOrdersService } from 'v2/orders/protocol-orders/protocol-orders.service';

@Controller('v2/bulk')
export class BulkController {
  constructor(protected _protocolOrdersService: ProtocolOrdersService) {}

  @Get('orders')
  @ApiOperation({
    description: 'Get bulk raw orders',
    tags: [ApiTag.Orders]
  })
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrders(@Query() query: BulkOrderQuery) {
    const result = await this._protocolOrdersService.getBulkOrders(query);
    return result;
  }
}
