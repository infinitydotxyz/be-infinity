import {
  OrderItemsQueryDto,
  OrdersDto,
  OrdersV2Dto,
  SignedOBOrderArrayDto,
  SignedOBOrderDto,
  UserOrderItemsQueryDto
} from '@infinityxyz/lib/types/dto/orders';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidNonceError } from 'common/errors/invalid-nonce.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';
import { ResponseDescription } from 'common/response-description';
import OrdersService from './orders.service';
import { ChainOBOrderHelper } from './chain-ob-order-helper';
import { ChainId } from '@infinityxyz/lib/types/core';
import { EthereumService } from 'ethereum/ethereum.service';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService, protected ethereumService: EthereumService) {}

  @Post('v2')
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
      const orders = body.orders.map((item) => new ChainOBOrderHelper(chainId, item));

      const maker = orders[0]?.signer;
      const sameMaker = orders.every((item) => item.signer === maker);
      if (!sameMaker) {
        throw new BadRequestException('All orders must have the same maker');
      }

      for (const order of orders) {
        try {
          const isSigValid = order.isSigValid();
          if (!isSigValid) {
            throw new Error('Invalid signature');
          }
          order.checkValidity();
        } catch (err) {
          if (err instanceof Error) {
            throw new BadRequestException(err.message);
          }
          console.error(err);
          throw new BadRequestException(`Invalid order`);
        }

        try {
          await order.checkFillability(this.ethereumService.getProvider(chainId));
        } catch (err) {
          if (err instanceof Error) {
            switch (err.message) {
              case 'not-fillable':
                throw new BadRequestException(`Order is not fillable. Invalid currency or nonce`);
              case 'no-balance':
                throw new BadRequestException(`Order is not fillable. Insufficient balance`);
              case 'no-approval':
                throw new BadRequestException(`Order is not fillable. Approvals have not been set`);
              default:
                console.error(err);
                throw new BadRequestException(err.message);
            }
          }
          console.error(err);
          throw new BadRequestException(`Order is not fillable`);
        }
      }

      // call service
      await this.ordersService.createOrder(chainId, maker, orders);
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
      const chainId = body.orders[0].chainId as ChainId;
      const sameChainId = body.orders.every((item) => item.chainId === chainId);
      if (!sameChainId) {
        throw new BadRequestException('All orders must have the same chainId');
      }

      /**
       * handles normalizing the order data (addresses, nfts)
       */
      const orders = body.orders.map((item) => {
        return new ChainOBOrderHelper(chainId, item.signedOrder);
      });

      const maker = orders[0]?.signer;
      const sameMaker = orders.every((item) => item.signer === maker);
      if (!sameMaker) {
        throw new BadRequestException('All orders must have the same maker');
      }

      for (const order of orders) {
        try {
          const isSigValid = order.isSigValid();
          if (!isSigValid) {
            throw new Error('Invalid signature');
          }
          order.checkValidity();
        } catch (err) {
          if (err instanceof Error) {
            throw new BadRequestException(err.message);
          }
          console.error(err);
          throw new BadRequestException(`Invalid order`);
        }

        try {
          await order.checkFillability(this.ethereumService.getProvider(chainId));
        } catch (err) {
          if (err instanceof Error) {
            switch (err.message) {
              case 'not-fillable':
                throw new BadRequestException(`Order is not fillable. Invalid currency or nonce`);
              case 'no-balance':
                throw new BadRequestException(`Order is not fillable. Insufficient balance`);
              case 'no-approval':
                throw new BadRequestException(`Order is not fillable. Approvals have not been set`);
              default:
                console.error(err);
                throw new BadRequestException(err.message);
            }
          }
          console.error(err);
          throw new BadRequestException(`Order is not fillable`);
        }
      }

      // call service
      await this.ordersService.createOrder(chainId, maker, orders);
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
