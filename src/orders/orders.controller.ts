import { OBOrderItem } from '@infinityxyz/lib/types/core';
import {
  OBOrderItemDto,
  OrderItemsQueryDto,
  OrdersDto,
  SignedOBOrderArrayDto,
  SignedOBOrderDto,
  UserOrderItemsQueryDto,
  UserOrderCollectionsQueryDto
} from '@infinityxyz/lib/types/dto/orders';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { UserAuth } from 'auth/user-auth.decorator';
import { instanceToPlain } from 'class-transformer';
import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidTokenError } from 'common/errors/invalid-token-error';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import OrdersService from './orders.service';

class OBOrderCollectionsArrayDto {
  data: Array<Omit<OBOrderItem, 'tokens'>>;
  cursor: string;
  hasNextPage: boolean;
}

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post(':userId')
  @ApiOperation({
    description: 'Post orders',
    tags: [ApiTag.Orders]
  })
  @UserAuth('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: String })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async postOrders(
    @ParamUserId('userId', ParseUserIdPipe) maker: ParsedUserId,
    @Body() body: OrdersDto
  ): Promise<void> {
    try {
      const orders = (body.orders ?? []).map((item: any) => instanceToPlain(item)) as SignedOBOrderDto[];
      await this.ordersService.createOrder(maker, orders);
    } catch (err) {
      if (err instanceof InvalidCollectionError) {
        throw new BadRequestException(err.message);
      } else if (err instanceof InvalidTokenError) {
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

  @Get(':userId/collections')
  @ApiOperation({
    description: 'Get collections from user orders',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @UserAuth('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getUserOrderCollections(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() reqQuery: UserOrderCollectionsQueryDto
  ): Promise<OBOrderCollectionsArrayDto> {
    const results = await this.ordersService.getUserOrderCollections(reqQuery, user);

    // dedup and normalize (make sure name & slug exist) collections:
    const colls: any = {};
    results?.data.forEach((item) => {
      if (item.collectionName && item.collectionSlug) {
        colls[item.collectionAddress] = {
          ...item
        };
      }
    });

    const data: Array<Omit<OBOrderItem, 'tokens'>> = [];
    for (const address of Object.keys(colls)) {
      const collData = colls[address] as Omit<OBOrderItemDto, 'tokens'>;
      data.push(collData);
    }
    return {
      data,
      cursor: '',
      hasNextPage: false
    };
  }

  @Get('id/:orderId')
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

  @Get(':userId')
  @ApiOperation({
    description: 'Get orders for a user',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @UserAuth('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getUserOrders(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() reqQuery: UserOrderItemsQueryDto
  ): Promise<SignedOBOrderArrayDto> {
    const results = await this.ordersService.getSignedOBOrders(reqQuery, user);
    return results;
  }

  @Get(':userId/nonce')
  @ApiOperation({
    description: 'Get order nonce for user',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrderNonce(@Param('userId') userId: string): Promise<number> {
    return await this.ordersService.getOrderNonce(userId);
  }
}
