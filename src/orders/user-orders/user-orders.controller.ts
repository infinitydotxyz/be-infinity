import { ApiRole, OBOrderItem } from '@infinityxyz/lib/types/core';
import {
  SignedOBOrderArrayDto,
  ErrorResponseDto,
  UserOrderCollectionsQueryDto,
  OBOrderItemDto,
  UserOrderItemsQueryDto
} from '@infinityxyz/lib/types/dto';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
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

  @Get(':userId')
  @ApiOperation({
    description: 'Get orders for a user',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
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

  @Get(':userId/collections')
  @ApiOperation({
    description: 'Get collections from user orders',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
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
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrderNonce(@Param('userId') userId: string): Promise<number> {
    return await this.userOrdersService.getOrderNonce(userId);
  }
}
