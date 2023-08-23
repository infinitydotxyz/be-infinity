import { ApiRole } from '@infinityxyz/lib/types/core';
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';
import { ApiParamUserId, Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { PixlRewardsService } from './pixl-rewards.service';
import { ReferralsService } from './referrals.service';

@Controller('pixl/rewards')
export class PixlRewardsController {
  constructor(protected referralService: ReferralsService, protected rewardsService: PixlRewardsService) { };

  @Get(":userId")
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Get a user\'s rewards',
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.OK)
  @ApiParamUserId('userId')
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRewards(@ParamUserId("userId", ParseUserIdPipe) user: ParsedUserId) {
    const rewards = await this.rewardsService.getRewards(user);
    const referralCode = await this.referralService.getReferralCode(user);

    return {
      ...rewards,
      referralCode: referralCode.code
    };
  }


  @Put(':userId/referrals')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Save a referral for a user',
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamUserId('userId')
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async saveReferral(@ParamUserId("userId", ParseUserIdPipe) user: ParsedUserId, @Body() referral: { code: string }) {
    await this.referralService.saveReferral(user, referral);
  }
}
