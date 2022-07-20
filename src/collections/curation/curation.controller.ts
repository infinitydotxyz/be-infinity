import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation
} from '@nestjs/swagger';
import { ParseCollectionIdPipe, ParsedCollectionId } from 'collections/collection-id.pipe';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { CurationService } from './curation.service';
import { CurationVoteDto } from '@infinityxyz/lib/types/dto/collections/curation/curation-vote.dto';
import { Auth } from 'auth/api-auth.decorator';
import { ApiRole, SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';

@Controller('collections')
export class CurationController {
  constructor(private curationService: CurationService) {}

  @Post('/:id/curated/:userId')
  @Auth(SiteRole.User, ApiRole.ApiGuest, 'userId')
  @ApiOperation({
    description: 'Vote on the collection',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiCreatedResponse()
  @ApiParamCollectionId('id')
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async vote(
    @ParamCollectionId('id', ParseCollectionIdPipe) parsedCollectionId: ParsedCollectionId,
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() vote: CurationVoteDto
  ) {
    const availableVotes = await this.curationService.getAvailableVotes(user);

    if (availableVotes <= 0 || availableVotes < vote.votes) {
      throw new BadRequestException('Insufficient amount of votes available');
    }

    await this.curationService.vote({
      parsedCollectionId,
      user,
      votes: vote.votes
    });
  }
}
