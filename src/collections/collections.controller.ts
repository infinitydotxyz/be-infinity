import { ChainId, Collection, CreationFlow, StatsPeriod } from '@infinityxyz/lib/types/core';
import { CollectionStatsArrayResponseDto, CollectionStatsDto } from '@infinityxyz/lib/types/dto/stats';
import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation
} from '@nestjs/swagger';

import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { PaginatedQuery } from 'common/dto/paginated-query.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { StatsService } from 'stats/stats.service';
import { TwitterService } from 'twitter/twitter.service';
import { VotesService } from 'votes/votes.service';
import { ParseCollectionIdPipe, ParsedCollectionId } from './collection-id.pipe';
import CollectionsService from './collections.service';
import {
  CollectionDto,
  CollectionHistoricalStatsQueryDto,
  CollectionSearchArrayDto,
  CollectionSearchQueryDto,
  CollectionStatsByPeriodDto,
  CollectionStatsQueryDto,
  TopOwnersArrayResponseDto,
  TopOwnersQueryDto,
  RankingQueryDto
} from '@infinityxyz/lib/types/dto/collections';
import { TweetArrayDto } from '@infinityxyz/lib/types/dto/twitter';
import { CollectionVotesDto } from '@infinityxyz/lib/types/dto/votes';
import { CollectionStatsArrayDto } from './dto/collection-stats-array.dto';
import { EXCLUDED_COLLECTIONS } from 'utils/stats';
import { AttributesService } from './attributes/attributes.service';
import { NftActivityArrayDto, NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { NftsService } from './nfts/nfts.service';
import { enqueueCollection } from './collections.utils';

@Controller('collections')
export class CollectionsController {
  constructor(
    private collectionsService: CollectionsService,
    private statsService: StatsService,
    private votesService: VotesService,
    private twitterService: TwitterService,
    private attributesService: AttributesService,
    private nftsService: NftsService
  ) {}

  @Get('search')
  @ApiOperation({
    description: 'Search for a collection by name',
    tags: [ApiTag.Collection]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionSearchArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async searchByName(@Query() search: CollectionSearchQueryDto) {
    const res = await this.collectionsService.searchByName(search);
    return res;
  }

  @Get('rankings')
  @ApiOperation({
    description: 'Get stats for collections ordered by a given field',
    tags: [ApiTag.Collection, ApiTag.Stats]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionStatsArrayResponseDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 3 }))
  async getStats(@Query() query: RankingQueryDto): Promise<CollectionStatsArrayResponseDto> {
    const res = await this.statsService.getCollectionRankings(query);

    const { getCollection } = await this.collectionsService.getCollectionsByAddress(
      res.data.map((st) => ({ address: st.collectionAddress, chainId: st.chainId }))
    );

    // get collection details and set them to the result:
    const finalData: any[] = [];
    for (const st of res.data) {
      const collectionData = getCollection({ address: st.collectionAddress ?? '', chainId: st.chainId });
      if (collectionData && collectionData.state?.create.step === CreationFlow.Complete) {
        st.collectionData = collectionData as Collection;
        finalData.push(st);
      }
    }
    res.data = finalData;

    return res;
  }

  @Get('stats')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Get stats for top collections.'
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionStatsArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 60 * 2 })) // 2 hour cache is fine
  async getCollectionStats(@Query() query: CollectionHistoricalStatsQueryDto): Promise<CollectionStatsArrayDto> {
    const result = await this.statsService.getMnemonicCollectionStats(query);
    // console.log('result', result?.collections)
    const collections = result?.collections ?? [];

    const { getCollection } = await this.collectionsService.getCollectionsByAddress(
      collections.map((coll) => ({ address: coll?.contractAddress ?? '', chainId: ChainId.Mainnet }))
    );

    const results: Collection[] = [];
    for (const coll of collections) {
      const collectionData = getCollection({
        address: coll.contractAddress ?? '',
        chainId: ChainId.Mainnet
      }) as Collection;

      if (collectionData?.metadata?.name) {
        if (!EXCLUDED_COLLECTIONS.includes(collectionData?.address)) {
          const resultItem: Collection = {
            ...collectionData,
            attributes: {} // don't include attributess
          };

          resultItem.stats = resultItem.stats ? resultItem.stats : {};
          if (query.period === StatsPeriod.Daily) {
            resultItem.stats.daily = resultItem.stats.daily ? resultItem.stats.daily : {};
            if (coll?.salesVolume) {
              resultItem.stats.daily.salesVolume = coll?.salesVolume;
            }
            if (coll?.avgPrice) {
              resultItem.stats.daily.avgPrice = coll?.avgPrice;
            }
          } else if (query.period === StatsPeriod.Weekly) {
            resultItem.stats.weekly = resultItem.stats.weekly ? resultItem.stats.weekly : {};
            if (coll?.salesVolume) {
              resultItem.stats.weekly.salesVolume = coll?.salesVolume;
            }
            if (coll?.avgPrice) {
              resultItem.stats.weekly.avgPrice = coll?.avgPrice;
            }
          } else if (query.period === StatsPeriod.Monthly) {
            resultItem.stats.monthly = resultItem.stats.monthly ? resultItem.stats.monthly : {};
            if (coll?.salesVolume) {
              resultItem.stats.monthly.salesVolume = coll?.salesVolume;
            }
            if (coll?.avgPrice) {
              resultItem.stats.monthly.avgPrice = coll?.avgPrice;
            }
          }
          results.push(resultItem);
        }
      } else {
        // can't get collection name (not indexed?)
        // console.log('--- collectionData?.metadata?.name', collectionData?.metadata?.name, coll.contractAddress)
        // disabling this until further discussion:
        // enqueueCollection({ chainId: ChainId.Mainnet, address: coll.contractAddress ?? '' }).then((res) => {
        //   console.log('enqueueCollection response:', res)
        // }).catch((e) => {
        //   console.log('enqueueCollection error', e)
        // })
      }
    }

    return {
      data: results
    };
  }

  @Get('/:id')
  @ApiOperation({
    tags: [ApiTag.Collection],
    description: 'Get a single collection by address and chain id or by slug'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 5 }))
  async getOne(
    @ParamCollectionId('id', ParseCollectionIdPipe) parsedCollection: ParsedCollectionId
  ): Promise<Collection> {
    const collection = await this.collectionsService.getCollectionByAddress(parsedCollection);

    if (!collection) {
      throw new NotFoundException();
    }

    collection.attributes = await this.attributesService.getAttributes(parsedCollection);

    return collection;
  }

  @Get('/:id/topOwners')
  @ApiOperation({
    tags: [ApiTag.Collection],
    description: 'Get the top owners of nfts in the collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: TopOwnersArrayResponseDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 }))
  async getTopOwners(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Query() query: TopOwnersQueryDto
  ): Promise<TopOwnersArrayResponseDto> {
    try {
      const topOwners = await this.collectionsService.getTopOwners(collection, query);
      if (!topOwners) {
        throw new InternalServerErrorException('Failed to get top owners');
      }
      return topOwners;
    } catch (err) {
      if (err instanceof InvalidCollectionError) {
        throw new NotFoundException();
      }
      throw err;
    }
  }

  @Get('/:id/stats')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Get historical stats for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionStatsArrayResponseDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 60 }))
  async getCollectionHistoricalStats(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Query() query: CollectionHistoricalStatsQueryDto
  ): Promise<CollectionStatsArrayResponseDto> {
    const response = await this.statsService.getCollectionHistoricalStats(collection, query);

    return response;
  }

  @Get('/:id/stats/current')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Get current hourly stats for a collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionStatsByPeriodDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor())
  async getCurrentStats(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<CollectionStatsDto> {
    const res = await this.statsService.getCollectionStats(collection, {
      period: StatsPeriod.Hourly,
      date: Date.now()
    });
    return res;
  }

  @Get('/:id/stats/:date')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Get stats for a single collection, at a specific date, for all periods passed in the query'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionStatsByPeriodDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 2 }))
  async getStatsByDate(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Param('date', ParseIntPipe) date: number,
    @Query() query: CollectionStatsQueryDto
  ): Promise<CollectionStatsByPeriodDto> {
    const response = await this.statsService.getCollectionStatsByPeriodAndDate(collection, date, query.periods);
    return response;
  }

  @Get('/:id/votes')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Votes],
    description: 'Get votes for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionVotesDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor())
  async getCollectionVotes(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<CollectionVotesDto> {
    const response = await this.votesService.getCollectionVotes(collection);

    return response;
  }

  @Get('/:id/mentions')
  @ApiOperation({
    tags: [ApiTag.Collection],
    description: 'Get twitter mentions for a single collection ordered by author followers'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success, type: TweetArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 5 }))
  async getCollectionTwitterMentions(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Query() query: PaginatedQuery
  ): Promise<TweetArrayDto> {
    const response = await this.twitterService.getCollectionTopMentions(collection.ref, query);

    return response;
  }

  @Get(':id/activity')
  @ApiOperation({
    description: 'Get activity for a specific nft',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftActivityArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 2 }))
  async getCollectionActivity(
    @ParamCollectionId('id', ParseCollectionIdPipe) { address, chainId }: ParsedCollectionId,
    @Query() filters: NftActivityFiltersDto
  ) {
    const { data, cursor, hasNextPage } = await this.nftsService.getNftActivity({ address, chainId }, filters);

    return {
      data,
      cursor,
      hasNextPage
    };
  }

  @Get(':id/enqueue')
  @ApiOperation({
    description: 'Enqueue collection for indexing',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiOkResponse({ description: ResponseDescription.Success, type: String })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 2 }))
  enqueueCollectionForIndexing(
    @ParamCollectionId('id', ParseCollectionIdPipe) { address, chainId }: ParsedCollectionId
  ) {
    enqueueCollection({ chainId, address })
      .then((res) => {
        console.log('enqueueCollection response:', res);
      })
      .catch((e) => {
        console.error('enqueueCollection error', e);
      });
    return '';
  }
}
