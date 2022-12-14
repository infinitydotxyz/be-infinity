import { UserCuratedCollectionDto, ErrorResponseDto } from '@infinityxyz/lib/types/dto';
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
import { ResponseDescription } from 'common/response-description';
import { OrdersService } from 'v2/orders/orders.service';
import { CollectionOrdersQuery } from 'v2/orders/query';

@Controller('v2/collections')
export class CollectionsController {
  constructor(protected _ordersService: OrdersService) {}

  @Get('/:id/orders')
  @ApiParamCollectionId('collectionId')
  @ApiOperation({
    description: 'Fetch collection orders',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiOkResponse({ type: UserCuratedCollectionDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async getCollectionOrders(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Query() query: CollectionOrdersQuery
  ): Promise<any> {
    const orders = await this._ordersService.getDisplayOrders(collection.chainId, query, {
      collection: collection.address
    });

    return orders;
  }
}
