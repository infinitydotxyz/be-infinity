import { ApiRole } from '@infinityxyz/lib/types/core';
import { Body, Controller, Get, HttpCode, HttpStatus, Put, Query } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';
import { ApiParamUserId, Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { LeaderboardQuery, PixlRewardsService } from './pixl-rewards.service';
import { ReferralsService } from './referrals.service';

@Controller('pixl/rewards')
export class PixlRewardsController {
  constructor(protected referralService: ReferralsService, protected rewardsService: PixlRewardsService) { }

  @Get('user/:userId')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: "Get a user's rewards",
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.OK)
  @ApiParamUserId('userId')
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRewards(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId) {
    const rewards = await this.rewardsService.getRewards(user);
    const referralCode = await this.referralService.getReferralCode(user);

    return {
      ...rewards,
      referralCode: referralCode.code
    };
  }

  @Get('stats/buys')
  @Auth(SiteRole.Guest, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: "Get buy reward stats",
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.OK)
  @ApiParamUserId('userId')
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getBuyStats(@Query('user') user?: string, @Query('chain') chainId?: string) {
    const rewards = await this.rewardsService.getBuyRewardStats({ user, chainId });
    return rewards;
  }

  @Put('user/:userId/referrals')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Save a referral for a user',
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamUserId('userId')
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async saveReferral(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId, @Body() referral: { code: string }) {
    await this.referralService.saveReferral(user, referral);
  }

  @Put('user/:userId/airdrop/boost')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Upgrade a user\'s airdrop',
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamUserId('userId')
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async upgradeAirdrop(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId) {
    await this.rewardsService.boostAirdrop(user);
  };


  @Get('leaderboard')
  @Auth(SiteRole.Guest, ApiRole.Guest)
  @ApiOperation({
    description: 'Get the leaderboard',
    tags: []
  })
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getLeaderboard(@Query() query: LeaderboardQuery) {
    return await this.rewardsService.getLeaderboard(query);
  }
}
