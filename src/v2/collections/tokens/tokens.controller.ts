import { ErrorResponseDto } from '@infinityxyz/lib/types/dto';
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse
} from '@nestjs/swagger';
import { ParseCollectionIdPipe, ParsedCollectionId } from 'collections/collection-id.pipe';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ApiParamTokenId, ParamTokenId } from 'common/decorators/param-token-id.decorator';
import { ResponseDescription } from 'common/response-description';
import { OrdersService } from 'v2/orders/orders.service';
import { TokenOrdersQuery } from 'v2/orders/query';

@Controller('v2/collections')
export class TokensController {
  constructor(protected _ordersService: OrdersService) {}

  @Get(':id/tokens/:tokenId/orders')
  @ApiOperation({
    description: 'Get orders for a single token',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiParamTokenId('tokenId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async getNftOrders(
    @ParamCollectionId('id', ParseCollectionIdPipe) { address, chainId }: ParsedCollectionId,
    @ParamTokenId('tokenId') tokenId: string,
    @Query() query: TokenOrdersQuery
  ) {
    const orders = await this._ordersService.getDisplayOrders(chainId, query, { collection: address, tokenId });
    return orders;
  }
}
