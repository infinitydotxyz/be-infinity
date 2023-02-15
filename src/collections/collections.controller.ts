import {
  ChainId,
  Collection,
  CollectionHistoricalSale,
  CollectionOrder,
  CollectionPeriodStatsContent,
  CollectionSaleAndOrder
} from '@infinityxyz/lib/types/core';
import { CollectionStatsArrayResponseDto, CollectionStatsDto } from '@infinityxyz/lib/types/dto/stats';
import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
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
  CollectionTrendingStatsQueryDto,
  TopOwnersArrayResponseDto,
  TopOwnersQueryDto
} from '@infinityxyz/lib/types/dto/collections';
import { NftActivityArrayDto, NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { TweetArrayDto } from '@infinityxyz/lib/types/dto/twitter';
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
import { UserParserService } from 'user/parser/parser.service';
import { ParseCollectionIdPipe, ParsedCollectionId } from './collection-id.pipe';
import CollectionsService from './collections.service';
import { CurationService } from './curation/curation.service';
import { CollectionStatsArrayDto } from './dto/collection-stats-array.dto';
import { NftsService } from './nfts/nfts.service';

const EXCLUDED_COLLECTIONS = [
  '0x81ae0be3a8044772d04f32398bac1e1b4b215aa8', // Dreadfulz
  '0x1dfe7ca09e99d10835bf73044a23b73fc20623df', // More loot
  '0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7', // Meebits
  '0x4e1f41613c9084fdb9e34e11fae9412427480e56', // Terraforms
  '0xa5d37c0364b9e6d96ee37e03964e7ad2b33a93f4', // Cat girls academia
  '0xff36ca1396d2a9016869274f1017d6c2139f495e' // dementors town wtf
];

@Controller('collections')
export class CollectionsController {
  constructor(
    private collectionsService: CollectionsService,
    private statsService: StatsService,
    private twitterService: TwitterService,
    private nftsService: NftsService,
    private curationService: CurationService,
    private firebaseService: FirebaseService,
    private userParserService: UserParserService
  ) {}

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
      this.statsService.refreshSocialsStats(collectionRef).catch((err) => console.error(err));
    };

    for (const address of idsArr) {
      if (address) {
        trigger(address).catch((err) => console.error(err));
      }
    }
    return query;
  }

  @Put('update-trending-colls')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Update top collections in firebase. Called by an external job'
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  async storeTrendingCollections() {
    await this.statsService.fetchAndStoreTopCollectionsFromReservoir();
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
    const limit = query.limit ?? 50;
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

      //  ignore colls where there is no name or profile image or if it is not supported
      if (collectionData?.metadata?.name && collectionData.metadata?.profileImage && collectionData?.isSupported) {
        // ignore excluded collections
        if (!EXCLUDED_COLLECTIONS.includes(collectionData?.address)) {
          collectionData.stats = {
            [queryPeriod]: {
              tokenCount: statsData.tokenCount,
              salesVolume: statsData.salesVolume,
              salesVolumeChange: statsData.salesVolumeChange,
              floorPrice: statsData.floorPrice,
              floorPriceChange: statsData.floorPriceChange,
              period: queryPeriod
            }
          };
          results.push(collectionData);

          if (results.length >= limit) {
            break;
          }
        }
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

  @Get('/:id/sales')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Sales],
    description: 'Get historical sales for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 5 * 60 }))
  async getCollectionHistoricalSales(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<Partial<CollectionHistoricalSale>[]> {
    return await this.statsService.getCollectionHistoricalSales(collection);
  }

  @Get('/:id/orders')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Orders],
    description: 'Get active orders for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 5 * 60 }))
  async getCollectionOrders(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<CollectionOrder[]> {
    return await this.statsService.getCollectionOrders(collection);
  }

  @Get('/:id/salesorders')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Orders, ApiTag.Sales],
    description: 'Get recent sales and orders for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 40 }))
  async getCollectionRecentSalesAnOrders(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<CollectionSaleAndOrder[]> {
    return await this.collectionsService.getRecentSalesAndOrders(collection);
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
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 10 * 60 }))
  async getCollectionHistoricalStats(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<Partial<CollectionStatsDto>> {
    const response = await this.statsService.getCollAllStats(collection);
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
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 }))
  async getCollectionTwitterMentions(
    @ParamCollectionId('id', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Query() query: PaginatedQuery
  ): Promise<TweetArrayDto> {
    const response = await this.twitterService.getCollectionTopMentions(collection.ref, query);

    return response;
  }

  @Get(':id/activity')
  @ApiOperation({
    description: 'Get activity for a collection or for a specific nft',
    tags: [ApiTag.Nft]
  })
  @ApiParamCollectionId('id')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftActivityArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 }))
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
}
