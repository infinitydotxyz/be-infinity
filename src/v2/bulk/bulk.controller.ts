import { ApiRole, ChainId } from '@infinityxyz/lib/types/core';
import { ErrorResponseDto } from '@infinityxyz/lib/types/dto';
import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { BulkOrderQuery } from 'v2/orders/bulk-query';
import { ProtocolOrdersService } from 'v2/orders/protocol-orders/protocol-orders.service';

@Controller('v2/bulk')
export class BulkController {
  constructor(
    protected _protocolOrdersService: ProtocolOrdersService,
    protected _config: ConfigService<EnvironmentVariables, true>
  ) {}

  @Get('orders')
  @ApiOperation({
    description: 'Get bulk raw orders',
    tags: [ApiTag.Orders]
  })
  @Throttle(10, 1)
  @Auth(SiteRole.Guest, ApiRole.User)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrders(@Query() query: BulkOrderQuery) {
    const result = await this._protocolOrdersService.getBulkOrders(query);
    return result;
  }

  @Put('snapshot')
  @ApiOperation({
    description: 'Initiate a snapshot of the orderbook',
    tags: [ApiTag.Orders]
  })
  @Auth(SiteRole.Guest, ApiRole.Admin)
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public takeSnapshot(@Body() body: { chainId: ChainId }) {
    const bucket: string = this._config.get('snapshotBucket');
    const chainId = body.chainId ?? ChainId.Mainnet;
    this._protocolOrdersService.takeSupportedCollectionsSnapshot(chainId, bucket).catch((err) => {
      console.error(err);
    });
  }
}
