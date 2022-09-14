import { Phase } from '@infinityxyz/lib/types/core';
import {
  PhaseRaffleDto,
  RaffleLeaderboardArrayDto,
  RaffleLeaderboardQueryDto,
  RaffleQueryDto,
  UserRaffleTicketsDto
} from '@infinityxyz/lib/types/dto';
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { RaffleService } from './raffle.service';

@Controller('raffle')
export class RaffleController {
  constructor(protected raffleService: RaffleService) {}

  @Get('/:phase')
  @ApiOperation({ summary: 'Get the raffle for a given phase' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: PhaseRaffleDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRaffle(@Param('phase') phase: Phase, @Query() query: RaffleQueryDto) {
    const raffle = await this.raffleService.getRaffle(query, phase);
    if (!raffle) {
      throw new NotFoundException(`No raffle found for phase ${phase}`);
    }
    return raffle;
  }

  @Get('/:phase/leaderboard')
  @ApiOperation({ summary: 'Get the leaderboard for a given phase' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: RaffleLeaderboardArrayDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getLeaderboard(@Param('phase') phase: Phase, @Query() query: RaffleLeaderboardQueryDto) {
    const leaderboard = await this.raffleService.getLeaderboard(query, phase);
    if (!leaderboard) {
      throw new NotFoundException(`No raffle leaderboard found for phase ${phase}`);
    }
    return leaderboard;
  }

  @Get('/:phase/user/:userId')
  @ApiOperation({ summary: "Get a user's raffle tickets" })
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserRaffleTicketsDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserTickets(
    @Param('phase') phase: Phase,
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: RaffleQueryDto
  ) {
    const userRaffleTickets = await this.raffleService.getUserRaffleTickets(query, phase, user);
    if (!userRaffleTickets) {
      throw new NotFoundException(`User ${user.userAddress} has no raffle tickets for phase ${phase}`);
    }
    return userRaffleTickets;
  }
}
