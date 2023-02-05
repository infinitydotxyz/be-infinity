import { Module } from '@nestjs/common';
import { ApiUserModule } from 'api-user/api-user.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
  imports: [ApiUserModule]
})
export class ReferralsModule {}
