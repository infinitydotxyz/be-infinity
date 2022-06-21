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
import { UserAuth } from 'auth/user-auth.decorator';
import { TokenContractService } from 'ethereum/contracts/token.contract.service';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { CurationVoteDto } from './curation.dto';
import { CurationService } from './curation.service';

@Controller('collections')
export class CurationController {
  constructor(private curationService: CurationService, private tokenContractService: TokenContractService) {}

  @Post('/:id/curated/:userId')
  @UserAuth('userId')
  @ApiOperation({
    description: 'Vote on the collection',
    tags: [ApiTag.Collection]
  })
  @ApiParamCollectionId('id')
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async vote(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @ParamUserId('userId', ParseUserIdPipe) { userAddress }: ParsedUserId,
    @Body() vote: CurationVoteDto
  ) {
    const availableVotes = await this.tokenContractService.getVotes(userAddress);

    if (availableVotes < vote.votes) {
      throw new BadRequestException('Insufficient amount of votes available');
    }

    await this.curationService.vote({
      collection,
      userAddress,
      votes: vote.votes
    });
  }
}
