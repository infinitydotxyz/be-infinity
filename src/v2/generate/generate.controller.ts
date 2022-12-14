import { SignerRequests } from '@infinityxyz/lib/types/core';
import {
  ErrorResponseDto,
  GenerateSellParams,
  GenerateBuyParams,
  GenerateOrderParams
} from '@infinityxyz/lib/types/dto';
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { ApiTag } from 'common/api-tags';
import { ResponseDescription } from 'common/response-description';
import { GenerateOrderError } from 'v2/orders/generate-order/generate-order-error';
import { GenerateOrderService } from 'v2/orders/generate-order/generate-order.service';

@Controller('v2/generate')
export class GenerateController {
  constructor(protected _generateOrderService: GenerateOrderService) {}

  @Post('/sell')
  @ApiOperation({
    description: 'Generate a sell order',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateSell(@Body() params: GenerateSellParams): Promise<SignerRequests> {
    try {
      return await this._generateOrderService.generateSell(params);
    } catch (err) {
      if (err instanceof GenerateOrderError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('/buy')
  @ApiOperation({
    description: 'Generate a buy order',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateBuy(@Body() params: GenerateBuyParams): Promise<SignerRequests> {
    try {
      return await this._generateOrderService.generateBuy(params);
    } catch (err) {
      if (err instanceof GenerateOrderError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('/listing')
  @ApiOperation({
    description: 'Generate a listing',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateListing(@Body() params: GenerateOrderParams): Promise<SignerRequests> {
    try {
      return await this._generateOrderService.generateListing(params);
    } catch (err) {
      if (err instanceof GenerateOrderError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('/bid')
  @ApiOperation({
    description: 'Generate a bid',
    tags: [ApiTag.Orders]
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  public async generateBid(@Body() params: GenerateOrderParams): Promise<SignerRequests> {
    try {
      return await this._generateOrderService.generateBid(params);
    } catch (err) {
      if (err instanceof GenerateOrderError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
