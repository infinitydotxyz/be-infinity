import { AssetReferralDto } from '@infinityxyz/lib/types/dto';
import { Injectable } from '@nestjs/common';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class ReferralsService {
  saveReferral(user: ParsedUserId, referral: AssetReferralDto): Promise<void> {
    console.log('saveReferral', user.userAddress, referral);
    throw new Error('Method not implemented.');
  }
}
