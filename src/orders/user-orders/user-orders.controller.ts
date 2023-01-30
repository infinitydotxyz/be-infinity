import { ChainId, OBOrderItem } from '@infinityxyz/lib/types/core';
import {
  ErrorResponseDto,
  OBOrderItemDto,
  SignedOBOrderArrayDto,
  UserOrderCollectionsQueryDto,
  UserOrderItemsQueryDto
} from '@infinityxyz/lib/types/dto';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { OBOrderCollectionsArrayDto } from 'orders/types';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { UserOrdersService } from './user-orders.service';

@Controller('userOrders')
export class UserOrdersController {
  constructor(protected userOrdersService: UserOrdersService) {}

  @Get(':userId/collections')
  @ApiOperation({
    description: 'Get collections from user orders',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getUserOrderCollections(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() reqQuery: UserOrderCollectionsQueryDto
  ): Promise<OBOrderCollectionsArrayDto> {
    const results = await this.userOrdersService.getUserOrderCollections(reqQuery, user);

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

  @Get(':userId/nonce')
  @ApiOperation({
    description: 'Get order nonce for user',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrderNonce(@Param('userId') userId: string, @Query('chainId') chainId?: ChainId): Promise<number> {
    const nonce = await this.userOrdersService.getNonce(userId, chainId ?? ChainId.Mainnet);
    return parseInt(nonce.toString(), 10);
  }

  @Get(':userId')
  @ApiOperation({
    description: 'Get orders for a user',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: SignedOBOrderArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getUserOrders(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() reqQuery: UserOrderItemsQueryDto
  ): Promise<SignedOBOrderArrayDto> {
    const results = await this.userOrdersService.getSignedOBOrders(reqQuery, user);
    return results;
  }
}
