import { RaffleLeaderboardArrayDto, RaffleLeaderboardQueryDto, RaffleQueryDto } from '@infinityxyz/lib/types/dto';
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
  @ApiOkResponse({ description: ResponseDescription.Success }) // TODO add type
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRaffle(@Param('phase') phaseId: string, @Query() query: RaffleQueryDto) {
    const raffle = await this.raffleService.getRaffle(query, phaseId);
    if (!raffle) {
      throw new NotFoundException(`No raffle found for phase ${phaseId}`);
    }
    return raffle;
  }

  @Get('/:phase/leaderboard')
  @ApiOperation({ summary: 'Get the leaderboard for a given phase' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: RaffleLeaderboardArrayDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getLeaderboard(@Param('phase') phaseId: string, @Query() query: RaffleLeaderboardQueryDto) {
    const leaderboard = await this.raffleService.getLeaderboard(query, phaseId);
    if (!leaderboard) {
      throw new NotFoundException(`No raffle leaderboard found for phase ${phaseId}`);
    }
    return leaderboard;
  }

  @Get('/:phase/user/:userId')
  @ApiOperation({ summary: "Get a user's raffle tickets" })
  @ApiOkResponse({ description: ResponseDescription.Success }) // TODO add type
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserTickets(
    @Param('phase') phaseId: string,
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: RaffleQueryDto
  ) {
    const userRaffleTickets = await this.raffleService.getUserRaffleTickets(query, phaseId, user);
    if (!userRaffleTickets) {
      throw new NotFoundException(`User ${user.userAddress} has no raffle tickets for phase ${phaseId}`);
    }
    return userRaffleTickets;
  }
}
