import { ChainId } from '@infinityxyz/lib/types/core';
import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ResponseDescription } from 'common/response-description';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(protected rewardsService: RewardsService) {}

  @Get()
  @ApiOperation({ summary: 'Get rewards config with current stats' })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async config() {
    const rewards = await this.rewardsService.getConfig(ChainId.Mainnet);
    if (!rewards) {
      throw new NotFoundException(`No rewards found for chain: ${ChainId.Mainnet}`);
    }
    return rewards;
  }
}
