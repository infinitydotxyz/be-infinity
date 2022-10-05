// import { RaffleLeaderboardArrayDto, RaffleLeaderboardQueryDto, RaffleQueryDto } from '@infinityxyz/lib/types/dto';
import { RaffleLeaderboardArrayDto, RaffleLeaderboardQueryDto } from '@infinityxyz/lib/types/dto';
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
// import { ParamUserId } from 'auth/param-user-id.decorator';
import { ResponseDescription } from 'common/response-description';
// import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
// import { ParsedUserId } from 'user/parser/parsed-user-id';
import { RafflesService } from './raffles.service';
import { RafflesQueryDto } from './types';

@Controller('raffles')
export class RafflesController {
  constructor(protected rafflesService: RafflesService) {}

  @Get()
  @ApiOperation({ summary: 'Get raffles' })
  @ApiOkResponse({ description: ResponseDescription.Success }) // TODO add type
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRaffles(@Query() query: RafflesQueryDto) {
    const raffles = await this.rafflesService.getRaffles(query);

    return raffles;
  }

  // @Get('/:phase')
  // @ApiOperation({ summary: 'Get the raffle for a given phase' })
  // @ApiOkResponse({ description: ResponseDescription.Success }) // TODO add type
  // @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  // @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  // async getRaffle(@Param('phase') phaseId: string, @Query() query: RaffleQueryDto) {
  //   const raffle = await this.rafflesService.getRaffle(query, phaseId);
  //   if (!raffle) {
  //     throw new NotFoundException(`No raffle found for phase ${phaseId}`);
  //   }
  //   return raffle;
  // }

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

  // @Get('/:phase/user/:userId')
  // @ApiOperation({ summary: "Get a user's raffle tickets" })
  // @ApiOkResponse({ description: ResponseDescription.Success }) // TODO add type
  // @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  // @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  // async getUserTickets(
  //   @Param('phase') phaseId: string,
  //   @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
  //   @Query() query: RaffleQueryDto
  // ) {
  //   const userRaffleTickets = await this.rafflesService.getUserRaffleTickets(query, phaseId, user);
  //   if (!userRaffleTickets) {
  //     throw new NotFoundException(`User ${user.userAddress} has no raffle tickets for phase ${phaseId}`);
  //   }
  //   return userRaffleTickets;
  // }
}
