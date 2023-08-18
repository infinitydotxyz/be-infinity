import {
  ChainId,
  Collection,
  CollectionOrder,
  CollectionSaleAndOrder,
  CollectionStats,
  SupportedCollection
} from '@infinityxyz/lib/types/core';
import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation
} from '@nestjs/swagger';

import { CollectionTrendingStatsQueryDto } from '@infinityxyz/lib/types/dto/collections';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Throttle } from '@nestjs/throttler';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { CollectionPeriodStatsContent } from 'common/types';
import { FirebaseService } from 'firebase/firebase.service';
import { mnemonicByParam } from 'mnemonic/mnemonic.service';
import { ReservoirOrderDepth } from 'reservoir/types';
import { StatsService } from 'stats/stats.service';
import { CollectionHistoricalSale } from 'stats/types';
import { TwitterService } from 'twitter/twitter.service';
import { ParsedCollection } from './collection-id.pipe';
import CollectionsService from './collections.service';
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
    private firebaseService: FirebaseService
  ) {}

  getParsedCollection(id: string): ParsedCollection {
    const [chainIdOrSlug, address] = id.split(':').map((x) => x.toLowerCase());
    let chainId = chainIdOrSlug;
    let slug = chainIdOrSlug;
    if (!address) {
      chainId = '';
    } else {
      slug = '';
    }
    const parsedCollection = {
      chainId,
      address,
      slug
    };
    return parsedCollection;
  }

  @Get('stats')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Get stats for top collections.'
  })
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 10 })) // 10 mins
  async getCollectionStats(@Query() query: CollectionTrendingStatsQueryDto): Promise<{ data: Partial<Collection>[] }> {
    const chainId = query.chainId ?? ChainId.Mainnet;
    const queryPeriod = query.period;
    const limit = query.limit ?? 50;
    const queryBy = query.queryBy as mnemonicByParam;

    let collections: CollectionPeriodStatsContent[] = [];

    if (chainId === ChainId.Goerli) {
      collections = await this.collectionsService.defaultGoerliColls();
    } else if (chainId === ChainId.Mainnet) {
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
      collections = result?.docs.map((doc) => doc.data() as CollectionPeriodStatsContent) ?? [];
    } else {
      throw new BadRequestException('Invalid chainId', chainId);
    }

    const results: Partial<Collection>[] = [];
    for (const coll of collections) {
      const collection: Partial<Collection> = {
        chainId: coll.chainId ?? ChainId.Mainnet,
        address: coll.contractAddress ?? '',
        hasBlueCheck: coll.hasBlueCheck ?? false,
        slug: coll.slug ?? '',
        numNfts: coll.tokenCount ?? 0,
        metadata: {
          profileImage: coll.image ?? '',
          name: coll.name ?? '',
          description: '',
          symbol: '',
          bannerImage: '',
          links: {
            timestamp: 0
          }
        }
      };

      //  ignore colls where there is no name or profile image or if it is not supported
      if (coll?.name && coll?.image) {
        // ignore excluded collections
        if (!EXCLUDED_COLLECTIONS.includes(coll?.contractAddress ?? '')) {
          collection.stats = {
            [queryPeriod]: {
              tokenCount: coll.tokenCount,
              salesVolume: coll.salesVolume,
              salesVolumeChange: coll.salesVolumeChange,
              floorPrice: coll.floorPrice,
              floorPriceChange: coll.floorPriceChange,
              period: queryPeriod
            }
          };
          results.push(collection);

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

  @Get('/supported')
  @ApiOperation({
    tags: [ApiTag.Collection],
    description: 'Get supported collections by chain id'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 1 }))
  async getSupportedColls(@Query() query: { chainId: string }): Promise<SupportedCollection[]> {
    return this.collectionsService.fetchSupportedColls(query.chainId);
  }

  @Get('/:id')
  @ApiOperation({
    tags: [ApiTag.Collection],
    description: 'Get a single collection by address and chain id or by slug'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 1 }))
  async getOne(@Param('id') id: string): Promise<Collection & Partial<CollectionStats>> {
    const parsedCollection = this.getParsedCollection(id);
    const collection = await this.collectionsService.getCollectionByAddress(parsedCollection);

    if (!collection) {
      throw new NotFoundException();
    }

    return collection;
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
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 30 }))
  async getCollectionHistoricalSales(
    @Param('id') id: string
  ): Promise<Partial<CollectionHistoricalSale>[]> {
    const parsedCollection = this.getParsedCollection(id);
    return await this.statsService.getCollectionHistoricalSales(parsedCollection);
  }

  @Get('/:id/orders')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Orders],
    description: 'Get active orders for a single collection'
  })
  @Throttle(20, 60)
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 10 }))
  async getCollectionOrders(
    @ParamCollectionId('id') id: string,
    @Query() query: { orderSide: 'buy' | 'sell' }
  ): Promise<CollectionOrder[]> {
    const parsedCollection = this.getParsedCollection(id);
    let isSellOrder = true;
    if (query.orderSide === 'buy') {
      isSellOrder = false;
    }
    return await this.statsService.getCollectionOrders(parsedCollection, isSellOrder);
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
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 10 }))
  async getCollectionRecentSalesAnOrders(
    @Param('id') id: string
  ): Promise<CollectionSaleAndOrder[]> {
    const parsedCollection = this.getParsedCollection(id);
    return await this.collectionsService.getRecentSalesAndOrders(parsedCollection);
  }

  @Get('/:id/orderdepth')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Orders],
    description: 'Get order depth for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 }))
  async getOrderDepth(
    @Param('id') id: string
  ): Promise<{ buy: ReservoirOrderDepth | undefined; sell: ReservoirOrderDepth | undefined }> {
    const parsedCollection = this.getParsedCollection(id);
    return await this.collectionsService.getOrderDepth(parsedCollection);
  }

  @Get('/:id/floorandtokencount')
  @ApiOperation({
    tags: [ApiTag.Collection, ApiTag.Stats],
    description: 'Get historical stats for a single collection'
  })
  @ApiParamCollectionId()
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 5 }))
  async getCollectionFloorAndTokenCount(
    @Param('id') id: string
  ): Promise<{ floorPrice: number; tokenCount: number }> {
    const parsedCollection = this.getParsedCollection(id);
    const response = await this.statsService.getCollFloorAndTokenCount(parsedCollection);
    return response;
  }
}
