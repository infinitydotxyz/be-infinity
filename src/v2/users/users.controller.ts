import { ChainId } from '@infinityxyz/lib/types/core';
import { ErrorResponseDto, Side, TakerOrdersQuery } from '@infinityxyz/lib/types/dto';
import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { AirdropRequirement } from 'v2/flur/types';
import { OrdersService } from 'v2/orders/orders.service';

@Controller('v2/users')
export class UsersController {
  constructor(protected _ordersService: OrdersService) {}

  @Get(':userId/orders')
  @ApiOperation({
    description: 'Get orders for a user',
    tags: [ApiTag.Orders, ApiTag.User]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getUserOrders(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: TakerOrdersQuery
  ) {
    if (query.side === Side.Taker) {
      if (!('status' in query)) {
        throw new BadRequestException('Status is required for taker orders');
      }
    }
    const orders = await this._ordersService.getDisplayOrders(query.chainId ?? ChainId.Mainnet, query, {
      user: user.userAddress
    });
    return orders;
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
    const nonce = await this._ordersService.getNonce(userId, chainId ?? ChainId.Mainnet);
    return parseInt(nonce.toString(), 10);
  }

  @Get(':userId/flur/airdropRequirements')
  @ApiOperation({
    description: 'Get airdrop requirements for the user'
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getConnectTwitterLink(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId
  ): Promise<AirdropRequirement> {}
}
