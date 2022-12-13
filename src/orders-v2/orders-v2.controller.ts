import { ApiRole, ChainOBOrder } from '@infinityxyz/lib/types/core';
import { ErrorResponseDto, OrdersV2Dto } from '@infinityxyz/lib/types/dto';
import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { instanceToPlain } from 'class-transformer';
import { ApiTag } from 'common/api-tags';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidNonceError } from 'common/errors/invalid-nonce.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';

import { ResponseDescription } from 'common/response-description';
import { ChainOBOrderHelper } from 'orders/chain-ob-order-helper';
import { BulkOrderQuery } from './bulk-query';
import { GenerateOrderService } from './generate-order/generate-order.service';
import { GenerateBuyParams, GenerateOrderParams, GenerateSellParams } from './generate-order/params';
import { SignerRequests } from './generate-order/result';
import { OrdersV2Service } from './orders-v2.service';
import { ProtocolOrdersService } from './protocol-orders/protocol-orders.service';

@Controller('orders-v2')
export class OrdersV2Controller {
  constructor(
    protected _ordersService: OrdersV2Service,
    protected _protocolOrdersService: ProtocolOrdersService,
    protected _generateOrderService: GenerateOrderService
  ) {}

  @Post()
  @ApiOperation({
    description: 'Post raw orders',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: String })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async postChainOBOrder(@Body() body: OrdersV2Dto): Promise<void> {
    try {
      const chainId = body.chainId;

      /**
       * handles normalizing the order data (addresses, nfts)
       */
      const orders = body.orders.map((item) => new ChainOBOrderHelper(chainId, instanceToPlain(item) as ChainOBOrder));
      const result = await this._ordersService.createOrders(chainId, orders);
      return result;
    } catch (err) {
      if (err instanceof InvalidCollectionError) {
        throw new BadRequestException(err.message);
      } else if (err instanceof InvalidTokenError) {
        throw new BadRequestException(err.message);
      } else if (err instanceof InvalidNonceError) {
        throw new BadRequestException(err.message);
      } else if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('bulk')
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

  @Post('/generate/sell')
  @ApiOperation({
    description: 'Generate a sell order',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateSell(@Body() params: GenerateSellParams): Promise<SignerRequests> {
    return this._generateOrderService.generateSell(params);
  }

  @Post('/generate/buy')
  @ApiOperation({
    description: 'Generate a buy order',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateBuy(@Body() params: GenerateBuyParams): Promise<SignerRequests> {
    return this._generateOrderService.generateBuy(params);
  }

  @Post('/generate/listing')
  @ApiOperation({
    description: 'Generate a listing',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateListing(@Body() params: GenerateOrderParams): Promise<SignerRequests> {
    return this._generateOrderService.generateListing(params);
  }

  @Post('/generate/bid')
  @ApiOperation({
    description: 'Generate a bid',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateBid(@Body() params: GenerateOrderParams): Promise<SignerRequests> {
    return this._generateOrderService.generateBid(params);
  }
}
