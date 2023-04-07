import { ApiRole, ChainId } from '@infinityxyz/lib/types/core';
import { ErrorResponseDto, Side, TakerOrdersQuery } from '@infinityxyz/lib/types/dto';
import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { BetaService } from 'v2/beta/beta.service';
import { OrdersService } from 'v2/orders/orders.service';

@Controller('v2/users')
export class UsersController {
  constructor(protected _ordersService: OrdersService, protected _betaService: BetaService) {}

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

  @Get(':userId/beta/auth')
  @ApiOperation({
    description: "Get the user's beta authorization status",
    tags: [ApiTag.User]
  })
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getBetaAuth(@ParamUserId('userId', ParseUserIdPipe) userId: ParsedUserId): Promise<unknown> {
    return await this._betaService.getBetaAuthorization(userId);
  }

  @Post(':userId/beta/auth/referral')
  @ApiOperation({
    description: "Get the user's beta authorization status",
    tags: [ApiTag.User]
  })
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async saveReferralCode(
    @ParamUserId('userId', ParseUserIdPipe) userId: ParsedUserId,
    @Query('referralCode') referralCode: string
  ) {
    return await this._betaService.referUser(userId, referralCode);
  }

  @Post(':userId/beta/auth/discord/callback')
  @ApiOperation({
    tags: [ApiTag.User]
  })
  @Throttle(20, 60)
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async handleDiscordCallback(
    @ParamUserId('userId', ParseUserIdPipe) userId: ParsedUserId,
    @Body() { code }: { code: string }
  ): Promise<unknown> {
    return await this._betaService.handleDiscordOAuthCallback({ code }, userId);
  }

  @Post(':userId/beta/auth/twitter/callback')
  @ApiOperation({
    tags: [ApiTag.User]
  })
  @Throttle(20, 60)
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async handleTwitterCallback(
    @ParamUserId('userId', ParseUserIdPipe) userId: ParsedUserId,
    @Body() { state, code }: { state: string; code: string }
  ): Promise<unknown> {
    return await this._betaService.handleTwitterOAuthCallback({ state, code }, userId);
  }

  @Get(':userId/nonce')
  @ApiOperation({
    description: 'Get order nonce for user',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async getOrderNonce(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query('chainId') chainId?: ChainId
  ): Promise<number> {
    const nonce = await this._ordersService.getNonce(user.userAddress, chainId ?? ChainId.Mainnet);
    return parseInt(nonce.toString(), 10);
  }
}
