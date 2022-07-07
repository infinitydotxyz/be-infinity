import { ChainId, Collection, CollectionPeriodStatsContent, StatsPeriod } from '@infinityxyz/lib/types/core';
import { CollectionStatsArrayResponseDto, CollectionStatsDto } from '@infinityxyz/lib/types/dto/stats';
import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Put,
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

// todo: move to lib
type CollectStatsQuery = {
  list: string;
};

import {
  CollectionDto,
  CollectionHistoricalStatsQueryDto,
  CollectionSearchArrayDto,
  CollectionSearchQueryDto,
  CollectionStatsByPeriodDto,
  CollectionStatsQueryDto,
  CollectionTrendingStatsQueryDto,
  RankingQueryDto,
  TopOwnersArrayResponseDto,
  TopOwnersQueryDto,
  PaginatedCollectionsDto
} from '@infinityxyz/lib/types/dto/collections';
import { NftActivityArrayDto, NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { TweetArrayDto } from '@infinityxyz/lib/types/dto/twitter';
import { CollectionVotesDto } from '@infinityxyz/lib/types/dto/votes';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { PaginatedQuery } from 'common/dto/paginated-query.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { FirebaseService } from 'firebase/firebase.service';
import { mnemonicByParam } from 'mnemonic/mnemonic.service';
import { StatsService } from 'stats/stats.service';
import { TwitterService } from 'twitter/twitter.service';
import { EXCLUDED_COLLECTIONS } from 'utils/stats';
import { VotesService } from 'votes/votes.service';
import { UPDATE_SOCIAL_STATS_INTERVAL } from '../constants';
import { AttributesService } from './attributes/attributes.service';
import { ParseCollectionIdPipe, ParsedCollectionId } from './collection-id.pipe';
import CollectionsService from './collections.service';
import { enqueueCollection } from './collections.utils';
import { CollectionStatsArrayDto } from './dto/collection-stats-array.dto';
import { NftsService } from './nfts/nfts.service';
import { CuratedCollectionsQuery } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections-query.dto';
import { CurationService } from './curation/curation.service';
import { ApiParamUserId, ParamUserId } from 'auth/param-user-id.decorator';
import { UserAuth } from 'auth/user-auth.decorator';
import { ParseUserIdPipe } from 'user/parser/parse-user-id.pipe';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import CuratedCollectionDto from './curation/curation.dto';

@Controller('collections')
export class CollectionsController {
  constructor(
    private collectionsService: CollectionsService,
    private statsService: StatsService,
    private votesService: VotesService,
    private twitterService: TwitterService,
    private attributesService: AttributesService,
    private nftsService: NftsService,
    private curationService: CurationService,
    private firebaseService: FirebaseService
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

  @Get('update-social-stats')
  @ApiOperation({
    description: 'A background task to collect Stats for a list of collection',
    tags: [ApiTag.Collection]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: String })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  collectStats(@Query() query: CollectStatsQuery) {
    const idsArr = query.list.split(',');

    const trigger = async (address: string) => {
      const collectionRef = (await this.firebaseService.getCollectionRef({
        chainId: ChainId.Mainnet,
        address
      })) as FirebaseFirestore.DocumentReference<Collection>;
      this.statsService.getCurrentSocialsStats(collectionRef).catch((err) => console.error(err));
    };
    let triggerTimer = 0;
    for (const address of idsArr) {
      if (address) {
        setTimeout(() => {
          trigger(address).catch((err) => console.error(err));
        }, triggerTimer);
        triggerTimer += UPDATE_SOCIAL_STATS_INTERVAL; // todo: use the right timer
      }
    }
    return query;
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
      if (collectionData) {
        st.collectionData = collectionData as Collection;
        finalData.push(st);
      }
    }
    res.data = finalData;

    return res;
  }

  @Put('update-trending-stats')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Update stats for top collections in firebase. Called by an external job'
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async storeTrendingCollectionStats(@Query() query: CollectionTrendingStatsQueryDto) {
    await this.statsService.fetchAndStoreTopCollectionsFromMnemonic(query);
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
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 })) // 10 mins
  async getCollectionStats(@Query() query: CollectionTrendingStatsQueryDto): Promise<CollectionStatsArrayDto> {
    const queryBy = query.queryBy as mnemonicByParam;
    const queryPeriod = query.period;
    const trendingCollectionsRef = this.firebaseService.firestore.collection(
      firestoreConstants.TRENDING_COLLECTIONS_COLL
    );
    let byParamDoc = '';
    let orderBy = '';
    if (queryBy === 'by_sales_volume') {
      byParamDoc = firestoreConstants.TRENDING_BY_VOLUME_DOC;
      orderBy = 'salesVolume';
    } else if (queryBy === 'by_avg_price') {
      byParamDoc = firestoreConstants.TRENDING_BY_AVG_PRICE_DOC;
      orderBy = 'avgPrice';
    }
    const byParamCollectionRef = trendingCollectionsRef.doc(byParamDoc);
    const byPeriodCollectionRef = byParamCollectionRef.collection(queryPeriod);

    const result = await byPeriodCollectionRef.orderBy(orderBy, 'desc').get(); // default descending
    const collections = result?.docs ?? [];

    const { getCollection } = await this.collectionsService.getCollectionsByAddress(
      collections.map((coll) => ({ address: coll?.data().contractAddress ?? '', chainId: coll?.data().chainId }))
    );

    const results: Collection[] = [];
    for (const coll of collections) {
      const statsData = coll.data() as CollectionPeriodStatsContent;

      const collectionData = getCollection({
        address: statsData.contractAddress ?? '',
        chainId: statsData.chainId ?? ChainId.Mainnet
      }) as Collection;

      if (collectionData?.metadata?.name && collectionData.metadata?.profileImage) {
        if (!EXCLUDED_COLLECTIONS.includes(collectionData?.address)) {
          const resultItem: Collection = {
            ...collectionData,
            attributes: {} // don't include attributess
          };

          resultItem.stats = {
            [queryPeriod]: {
              ownerCount: statsData.ownerCount,
              tokenCount: statsData.tokenCount,
              salesVolume: statsData.salesVolume,
              avgPrice: statsData.avgPrice,
              minPrice: statsData.minPrice,
              maxPrice: statsData.maxPrice,
              numSales: statsData.numSales,
              period: queryPeriod
            }
          };
          results.push(resultItem);
        }
      }
    }

    return {
      data: results
    };
  }

  @Get('curated')
  @ApiOperation({
    description: 'Fetch all curated collections',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiOkResponse({ type: PaginatedCollectionsDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async getAllCurated(@Query() query: CuratedCollectionsQuery) {
    return this.collectionsService.getCurated(query);
  }
  @Get('/:id/curated/:userId')
  @UserAuth('userId')
  @ApiParamUserId('userId')
  @ApiParamCollectionId('collectionId')
  @ApiOperation({
    description: 'Fetch curation details and estimations of the collection',
    tags: [ApiTag.Collection, ApiTag.Curation]
  })
  @ApiOkResponse({ type: CuratedCollectionDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async getCurated(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId
  ) {
    const curated = await this.curationService.findUserCurated(user, collection);

    if (!curated) {
      // TODO: maybe return empty object instead?
      throw new NotFoundException('Curation details and estimations not found!');
    }

    return curated;
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
    description: 'Get activity for a collection or a specific nft activity',
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
    tags: [ApiTag.Collection]
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
