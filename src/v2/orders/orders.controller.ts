import { ChainOBOrder } from '@infinityxyz/lib/types/core';
import { ErrorResponseDto, OrdersV2Dto } from '@infinityxyz/lib/types/dto';
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { instanceToPlain } from 'class-transformer';
import { ApiTag } from 'common/api-tags';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidNonceError } from 'common/errors/invalid-nonce.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';

import { ResponseDescription } from 'common/response-description';
import { ChainOBOrderHelper } from 'orders/chain-ob-order-helper';
import { OrdersService } from './orders.service';
import { ProtocolOrdersService } from './protocol-orders/protocol-orders.service';

@Controller('v2/orders')
export class OrdersController {
  constructor(protected _ordersService: OrdersService, protected _protocolOrdersService: ProtocolOrdersService) {}

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
}
