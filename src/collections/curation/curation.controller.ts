import { Body, Controller, ParseArrayPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
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
import {
  CurationVoteBulkDto,
  CurationVoteDto
} from '@infinityxyz/lib/types/dto/collections/curation/curation-vote.dto';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { ParsedBulkVotes, ParsedBulkVotesPipe } from './bulk-votes.pipe';

@Controller('collections')
export class CurationController {
  constructor(private curationService: CurationService) {}

  @Post('/:id/curated/:userId')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
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
    await this.curationService.vote({ parsedCollectionId, user, votes: vote.votes });
  }

  @Post('curated/:userId')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Vote on multiple collections in bulk',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiBody({ type: CurationVoteBulkDto, isArray: true })
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async voteBulk(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body(new ParseArrayPipe({ items: CurationVoteBulkDto }), ParsedBulkVotesPipe) votes: ParsedBulkVotes[]
  ) {
    await this.curationService.voteBulk(votes, user);
  }
}
