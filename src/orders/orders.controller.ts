import {
  OrderItemsQueryDto,
  OrdersDto,
  SignedOBOrderArrayDto,
  SignedOBOrderDto,
  UserOrderItemsQueryDto
} from '@infinityxyz/lib/types/dto/orders';
import { trimLowerCase, getDigest, orderHash, verifySig } from '@infinityxyz/lib/utils';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { instanceToPlain } from 'class-transformer';
import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidNonceError } from 'common/errors/invalid-nonce.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';
import { ResponseDescription } from 'common/response-description';
import OrdersService from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    description: 'Post orders',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: String })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async postOrders(@Body() body: OrdersDto): Promise<void> {
    try {
      const orders = (body.orders ?? []).map((item: any) => instanceToPlain(item)) as SignedOBOrderDto[];
      const maker = trimLowerCase(orders[0].signedOrder.signer);
      if (!maker) {
        throw new Error('Invalid maker');
      }

      // check signatures
      const valid = orders.every((order) => {
        const { signedOrder } = order;
        const { signer, sig } = signedOrder;
        const hashOfOrder = orderHash(signedOrder);
        const digest = getDigest(order.chainId, order.execParams.complicationAddress, hashOfOrder);
        const isSigValid = verifySig(digest, signer, sig);
        return isSigValid;
      });

      if (!valid) {
        throw new Error('Invalid signatures');
      }

      // call service
      await this.ordersService.createOrder(maker, orders);
    } catch (err) {
      if (err instanceof InvalidCollectionError) {
        throw new BadRequestException(err.message);
      } else if (err instanceof InvalidTokenError) {
        throw new BadRequestException(err.message);
      } else if (err instanceof InvalidNonceError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get()
  @ApiOperation({
    description: 'Get orders',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrders(@Query() reqQuery: OrderItemsQueryDto): Promise<SignedOBOrderArrayDto> {
    const results = await this.ordersService.getSignedOBOrders(reqQuery);
    return results;
  }

  @Get('reservoir')
  @ApiOperation({
    description: 'Get reservoir orders',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getReservoirOrders(@Query() reqQuery: OrderItemsQueryDto): Promise<SignedOBOrderArrayDto> {
    const limit = reqQuery.limit;
    let sellOrders = true;
    let buyOrders = true;

    if (reqQuery.isSellOrder === true) {
      buyOrders = false;
    } else if (reqQuery.isSellOrder === false) {
      sellOrders = false;
    }

    // let sortByPrice = false;
    // switch (reqQuery.orderBy) {
    //   case 'startPriceEth':
    //     sortByPrice = true;
    //     break;
    //   case 'startTimeMs':
    //     break;
    // }

    // orderBy: 'startPriceEth',
    // orderByDirection: 'desc'
    // orderByDirection: 'asc'

    const results = await this.ordersService.getReservoirOrders(limit, sellOrders, buyOrders, reqQuery.cursor ?? '');

    return {
      data: results.orders,
      cursor: results.cursor,
      hasNextPage: results.orders.length > 0
    };
  }

  @Get('/:orderId')
  @ApiOperation({
    description: 'Get a signed order with the given id.',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getUserSignedOrder(
    @Param('orderId') orderId: string,
    @Query() reqQuery: UserOrderItemsQueryDto
  ): Promise<SignedOBOrderDto | undefined> {
    if (!reqQuery.id) {
      reqQuery.id = orderId;
    }
    const results = await this.ordersService.getSignedOBOrders(reqQuery, undefined);
    if (results?.data && results.data[0]) {
      return results.data[0];
    }
    throw new NotFoundException('Failed to find order');
  }
}
