import { ErrorResponseDto } from '@infinityxyz/lib/types/dto/common';
import { Controller, Get, UseInterceptors } from '@nestjs/common';
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
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { AttributesService } from './attributes.service';

@Controller('collections')
export class AttributesController {
  constructor(private attributesService: AttributesService) {}

  @Get(':id/attributes')
  @ApiOperation({
    description: 'Get a list of attributes for a collection',
    tags: [ApiTag.Collection]
  })
  @ApiParamCollectionId('id')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 }))
  async getAttributes(@ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId) {
    return this.attributesService.getAttributes(collection);
  }
}
