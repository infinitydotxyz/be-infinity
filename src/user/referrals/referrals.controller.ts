import { ApiRole } from '@infinityxyz/lib/types/core';
import { AssetReferralDto } from '@infinityxyz/lib/types/dto';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiOperation, ApiNoContentResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { ApiParamUserId, Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ReferralsService } from './referrals.service';

@Controller('user')
export class ReferralsController {
  constructor(protected referralsService: ReferralsService) {}

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
  async saveReferral(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId, @Body() referral: AssetReferralDto) {
    if (user.userAddress === referral.referrer) {
      throw new BadRequestException('Invalid referral');
    }
    await this.referralsService.saveReferral(user, referral);
    return;
  }
}
