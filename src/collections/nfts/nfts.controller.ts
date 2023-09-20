import { NftSaleAndOrder } from '@infinityxyz/lib/types/core';
import { Controller, Get, NotFoundException, UseInterceptors } from '@nestjs/common';
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
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { NftsService } from './nfts.service';

@Controller('collections')
export class NftsController {
  constructor(protected nftService: NftsService) {}

  @Get(':id/nfts/:tokenId')
  @ApiOperation({
    description: 'Get a single nft',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiParamTokenId('tokenId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 1 }))
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

  @Get(':id/nfts/:tokenId/salesorders')
  @ApiOperation({
    tags: [ApiTag.Nft],
    description: 'Get sales and orders for a single token'
  })
  @ApiParamCollectionId('id')
  @ApiParamTokenId('tokenId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 }))
  async getSalesAndOrders(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @ParamTokenId('tokenId') tokenId: string
  ): Promise<NftSaleAndOrder[]> {
    return await this.nftService.getSalesAndOrders(collection, tokenId);
  }
}
