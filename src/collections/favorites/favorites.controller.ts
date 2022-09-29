import { BadRequestException, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation
} from '@nestjs/swagger';
import { ApiTag } from 'common/api-tags';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { ResponseDescription } from 'common/response-description';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { FavoritesService } from './favorites.service';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { StakeLevel } from '@infinityxyz/lib/types/core';
import { ParseCollectionIdPipe, ParsedCollectionId } from 'collections/collection-id.pipe';

@Controller('collections')
export class FavoritesController {
  constructor(private favoritesService: FavoritesService, private stakerService: StakerContractService) {}

  @Post(':collectionId/favorites/:userId')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Favorite a collection for the current phase',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async submitFavorite(
    @ParamUserId('userId', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId
  ) {
    const userStakeLevel = await this.stakerService.getStakeLevel(user);

    if (userStakeLevel < StakeLevel.Bronze) {
      throw new ForbiddenException('You must have a bronze staking level or higher to vote!');
    }

    const existingFavorite = await this.favoritesService.getFavoriteCollection(user);

    if (existingFavorite != null) {
      throw new BadRequestException(
        'You have already favorited a collection. Collections can only be favorited once each phase!'
      );
    }

    await this.favoritesService.saveFavorite(collection, user);
  }

  @Get('favorites/:userId')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Get the user-favorite collection for the current phase',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiOkResponse()
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async getUserFavorite(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId) {
    return this.favoritesService.getFavoriteCollection(user);
  }
}
