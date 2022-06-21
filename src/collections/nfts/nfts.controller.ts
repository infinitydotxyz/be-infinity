import { BadRequestException, Controller, Get, NotFoundException, Query, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation
} from '@nestjs/swagger';
import { ParseCollectionIdPipe, ParsedCollectionId } from 'collections/collection-id.pipe';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ApiParamTokenId, ParamTokenId } from 'common/decorators/param-token-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { BadQueryError } from 'common/errors/bad-query.error';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { FirebaseService } from 'firebase/firebase.service';
import { NftsService } from './nfts.service';
import {
  NftActivityArrayDto,
  NftActivityFiltersDto,
  NftArrayDto,
  NftDto,
  NftsQueryDto
} from '@infinityxyz/lib/types/dto/collections/nfts';

@Controller('collections')
export class NftsController {
  constructor(private nftService: NftsService, private firebaseService: FirebaseService) {}

  @Get(':id/nfts')
  @ApiOperation({
    description: 'Get a list of nfts for a collection',
    tags: [ApiTag.Collection, ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 20 }))
  async getCollectionNfts(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Query() query: NftsQueryDto
  ) {
    try {
      const nfts = await this.nftService.getCollectionNfts(collection, query);

      return nfts;
    } catch (err) {
      if (err instanceof BadQueryError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get(':id/nfts/:tokenId')
  @ApiOperation({
    description: 'Get a single nft',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiParamTokenId('tokenId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 20 }))
  async getNft(
    @ParamCollectionId('id', ParseCollectionIdPipe) { address, chainId }: ParsedCollectionId,
    @ParamTokenId('tokenId') tokenId: string
  ) {
    const nft = await this.nftService.getNft({ address, chainId, tokenId });
    if (!nft) {
      throw new NotFoundException(
        `Failed to find nft with address: ${address}, chainId: ${chainId} and tokenId: ${tokenId}`
      );
    }

    return nft;
  }

  @Get(':id/nfts/:tokenId/activity')
  @ApiOperation({
    description: 'Get activity for a specific nft',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiParamTokenId('tokenId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftActivityArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async getNftActivity(
    @ParamCollectionId('id', ParseCollectionIdPipe) { address, chainId }: ParsedCollectionId,
    @ParamTokenId('tokenId') tokenId: string,
    @Query() filters: NftActivityFiltersDto
  ) {
    const { data, cursor, hasNextPage } = await this.nftService.getNftActivity({ address, chainId, tokenId }, filters);

    return {
      data,
      cursor,
      hasNextPage
    };
  }
}
