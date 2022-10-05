import {
  RaffleLeaderboardArrayDto,
  RaffleLeaderboardQueryDto,
  RaffleQueryDto,
  UserRafflesArrayDto
} from '@infinityxyz/lib/types/dto';
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { RafflesService } from './raffles.service';
import { RafflesQueryDto } from './types';

@Controller('raffles')
export class RafflesController {
  constructor(protected rafflesService: RafflesService) {}

  @Get()
  @ApiOperation({ summary: 'Get raffles' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserRafflesArrayDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRaffles(@Query() query: RafflesQueryDto) {
    const raffles = await this.rafflesService.getRaffles(query);

    if (!raffles) {
      throw new NotFoundException(`No raffles found for chainId: ${query.chainId}`);
    }

    return {
      data: raffles,
      hasNextPage: false,
      cursor: ''
    };
  }

  @Get('/:raffleId/leaderboard')
  @ApiOperation({ summary: 'Get the leaderboard for a given phase' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: RaffleLeaderboardArrayDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getLeaderboard(@Param('raffleId') raffleId: string, @Query() query: RaffleLeaderboardQueryDto) {
    const leaderboard = await this.rafflesService.getLeaderboard(query, raffleId);
    if (!leaderboard) {
      throw new NotFoundException(`No raffle leaderboard found for id: ${raffleId}`);
    }
    return leaderboard;
  }

  @Get('/:raffleId/entrants/:userId')
  @ApiOperation({ summary: "Get a user's raffle tickets" })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserTickets(
    @Param('raffleId') raffleId: string,
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: RaffleQueryDto
  ) {
    const userRaffleTickets = await this.rafflesService.getUserRaffleTickets(query, raffleId, user);
    if (!userRaffleTickets) {
      throw new NotFoundException(`User ${user.userAddress} has no raffle tickets for raffle ${raffleId}`);
    }
    return userRaffleTickets;
  }
}
