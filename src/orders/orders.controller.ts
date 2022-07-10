import {
  OBOrderItemDto,
  OrderItemsQueryDto,
  OrdersDto,
  SignedOBOrderArrayDto,
  SignedOBOrderDto,
  UserOrderItemsQueryDto
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

type UserOrderCollectionsQueryDto = UserOrderItemsQueryDto & {
  name?: string;
};

class OBOrderCollectionsArrayDto {
  data: OBOrderItemDto[];
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
  public async getUserOrdersCollections(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() reqQuery: UserOrderCollectionsQueryDto
  ): Promise<OBOrderCollectionsArrayDto> {
    reqQuery.limit = 999999; // get all user's orders (todo: Number.MAX_SAFE_INTEGER doesn't work here)
    const results = await this.ordersService.getSignedOBOrders(reqQuery, user);

    // dedup and normalize (make sure name & slug exist) collections:
    const colls: any = {};
    results?.data.forEach((order) => {
      order.nfts.forEach((nft) => {
        if (nft.collectionName && nft.collectionSlug) {
          colls[nft.collectionAddress] = {
            ...nft
          };
        }
      });
    });

    const data: OBOrderItemDto[] = [];
    const nameSearch = (reqQuery.name ?? '').toLowerCase();
    for (const address of Object.keys(colls)) {
      const collData = colls[address] as OBOrderItemDto;
      collData.tokens = []; // not needed for this response.
      if (nameSearch) {
        if (collData.collectionName.toLowerCase().indexOf(nameSearch) >= 0) {
          data.push(collData);
        }
      } else {
        data.push(collData);
      }
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
