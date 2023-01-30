import {
  ChainId,
  Collection,
  CollectionHistoricalSale,
  CollectionPeriodStatsContent,
  CollectionStats,
  HistoricalSalesTimeBucket,
  OrderDirection,
  PreAggregatedSocialsStats,
  SocialsStats,
  Stats,
  StatsPeriod,
  StatType
} from '@infinityxyz/lib/types/core';
import {
  CollectionHistoricalSalesQueryDto,
  CollectionHistoricalStatsQueryDto,
  CollectionStatsByPeriodDto,
  CollectionTrendingStatsQueryDto,
  RankingQueryDto
} from '@infinityxyz/lib/types/dto/collections';
import { CollectionStatsArrayResponseDto, CollectionStatsDto } from '@infinityxyz/lib/types/dto/stats';
import { InfinityTweet, InfinityTwitterAccount } from '@infinityxyz/lib/types/services/twitter';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { AlchemyService } from 'alchemy/alchemy.service';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { mnemonicByParam, MnemonicService } from 'mnemonic/mnemonic.service';
import { MnemonicPricesForStatsPeriod, MnemonicVolumesForStatsPeriod } from 'mnemonic/mnemonic.types';
import { CursorService } from 'pagination/cursor.service';
import { PostgresService } from 'postgres/postgres.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { getCollectionDocId, getStatsDocInfo } from 'utils/stats';
import { ZoraService } from 'zora/zora.service';
import { ONE_HOUR } from '../constants';
import { DiscordService } from '../discord/discord.service';
import { FirebaseService } from '../firebase/firebase.service';
import { TwitterService } from '../twitter/twitter.service';
import { calcPercentChange, safelyWrapPromise } from '../utils';

@Injectable()
export class StatsService {
  private fsBatchHandler: FirestoreBatchHandler;
  private readonly socialsGroup = firestoreConstants.COLLECTION_SOCIALS_STATS_COLL;
  private readonly statsGroup = firestoreConstants.COLLECTION_STATS_COLL;

  private socialsStats = [
    StatType.DiscordFollowers,
    StatType.DiscordFollowersPercentChange,
    StatType.DiscordPresence,
    StatType.DiscordPresencePercentChange,
    StatType.TwitterFollowers,
    StatType.TwitterFollowersPercentChange
  ];

  constructor(
    private discordService: DiscordService,
    private twitterService: TwitterService,
    private firebaseService: FirebaseService,
    private mnemonicService: MnemonicService,
    private paginationService: CursorService,
    private zoraService: ZoraService,
    private reservoirService: ReservoirService,
    private alchemyService: AlchemyService,
    private postgresService: PostgresService
  ) {
    this.fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
  }

  async getCollectionRankings(queryOptions: RankingQueryDto): Promise<CollectionStatsArrayResponseDto> {
    const { primary: primaryStatsCollectionName, secondary: secondaryStatsCollectionName } =
      this.getStatsCollectionNames(queryOptions.orderBy);

    const query = {
      ...queryOptions,
      limit: queryOptions.limit
    };

    const primaryStats = await this.getPrimaryStats(query, primaryStatsCollectionName);
    const timestamp = getStatsDocInfo(queryOptions.date, queryOptions.period).timestamp;
    const secondaryStatsPromises = primaryStats.data.map(async (primaryStat) => {
      return this.getSecondaryStats(primaryStat, secondaryStatsCollectionName, query.period, timestamp);
    });

    const secondaryStats = await Promise.allSettled(secondaryStatsPromises);

    const combinedStats = await Promise.all(
      primaryStats.data.map(async (primary, index) => {
        const secondaryPromiseResult = secondaryStats[index];

        const secondary = secondaryPromiseResult.status === 'fulfilled' ? secondaryPromiseResult.value : undefined;

        const collection = { address: primary?.collectionAddress, chainId: primary?.chainId };
        const merged = await this.mergeStats(primary, secondary, collection);
        return merged;
      })
    );

    return {
      data: combinedStats,
      cursor: primaryStats.cursor,
      hasNextPage: primaryStats.hasNextPage
    };
  }

  async getCollectionStatsByPeriodAndDate(
    collection: ParsedCollectionId,
    date: number,
    periods: StatsPeriod[]
  ): Promise<CollectionStatsByPeriodDto> {
    const getQuery = (period: StatsPeriod) => {
      const query: CollectionHistoricalStatsQueryDto = {
        period,
        orderDirection: OrderDirection.Descending,
        limit: 1,
        maxDate: date,
        minDate: 0
      };
      return query;
    };

    const queries = periods.map((period) => getQuery(period));

    const responses = await Promise.all(queries.map((query) => this.getCollectionHistoricalStats(collection, query)));

    const statsByPeriod: CollectionStatsByPeriodDto = responses.reduce(
      (acc: Record<StatsPeriod, CollectionStatsDto>, statResponse) => {
        const period = statResponse?.data?.[0]?.period;
        if (period) {
          return {
            ...acc,
            [period]: statResponse.data[0]
          };
        }
        return acc;
      },
      {} as any
    );

    return statsByPeriod;
  }

  async fetchAndStoreTopCollectionsFromMnemonic(query: CollectionTrendingStatsQueryDto) {
    const queryBy = query.queryBy as mnemonicByParam;
    const queryPeriod = query.period;
    const trendingCollectionsRef = this.firebaseService.firestore.collection(
      firestoreConstants.TRENDING_COLLECTIONS_COLL
    );
    const byParamDoc = firestoreConstants.TRENDING_BY_VOLUME_DOC;
    const byParamDocRef = trendingCollectionsRef.doc(byParamDoc);
    const byPeriodCollectionRef = byParamDocRef.collection(queryPeriod);

    const data = await this.mnemonicService.getTopCollections(queryBy, queryPeriod, { limit: 70, offset: 0 });

    if (data && data.collections?.length > 0) {
      for (const coll of data.collections) {
        if (!coll.contractAddress) {
          return;
        }

        const collectionDocId = getCollectionDocId({
          chainId: ChainId.Mainnet,
          collectionAddress: coll.contractAddress
        });
        const trendingCollectionDocRef = byPeriodCollectionRef.doc(collectionDocId);

        // fetch prices for the period
        const prices = await this.fetchPricesForStatsPeriod(coll.contractAddress, queryPeriod);
        const floorPrice = await this.getCollectionFloorPrice({
          address: coll.contractAddress,
          chainId: (coll.chainId as ChainId) ?? ChainId.Mainnet
        });

        // fetch sales for the period
        const sales = await this.fetchSalesForStatsPeriod(coll.contractAddress, queryPeriod);

        const dataToStore: CollectionPeriodStatsContent = {
          chainId: ChainId.Mainnet,
          contractAddress: coll.contractAddress,
          period: queryPeriod,
          salesVolume: sales?.salesVolume,
          numSales: sales.numSales,
          minPrice: prices.minPrice,
          maxPrice: prices.maxPrice,
          avgPrice: prices.avgPrice,
          floorPrice: floorPrice ?? 0,
          updatedAt: Date.now()
        };

        if (queryBy === 'by_sales_volume') {
          // more accurate sales volume
          if (coll.salesVolume) {
            dataToStore.salesVolume = parseFloat(`${coll.salesVolume}`);
          }
          this.fsBatchHandler.add(trendingCollectionDocRef, dataToStore, { merge: true });
        } else {
          console.error('Unknown queryBy param');
        }

        // for each collection: fetch owner count & total supply
        // todo: adi could fetch from firestore instead of calling api
        const owners = await this.mnemonicService.getNumOwners(`${coll.contractAddress}`);
        const ownerCount = owners?.dataPoints[0]?.count;
        this.fsBatchHandler.add(
          trendingCollectionDocRef,
          {
            ownerCount: parseInt(ownerCount ?? '0')
          },
          { merge: true }
        );

        const tokens = await this.mnemonicService.getNumTokens(`${coll.contractAddress}`);
        const tokenCount =
          parseInt(tokens?.dataPoints[0]?.totalMinted ?? '0') - parseInt(tokens?.dataPoints[0]?.totalBurned ?? '0');
        this.fsBatchHandler.add(
          trendingCollectionDocRef,
          {
            tokenCount
          },
          { merge: true }
        );
      }
    }
    this.fsBatchHandler.flush().catch((err) => console.error('error saving mnemonic collection tokens', err));
    return data;
  }

  async fetchPricesForStatsPeriod(
    collectionAddress: string,
    period: StatsPeriod
  ): Promise<MnemonicPricesForStatsPeriod> {
    const resp = await this.mnemonicService.getPricesByContract(collectionAddress, period);
    const dataPoints = resp?.dataPoints ?? [];
    let maxPrice = 0,
      minPrice = Number.MAX_VALUE,
      avgPrice = 0,
      totalPrice = 0,
      numItems = 0;

    for (const dataPoint of dataPoints) {
      if (dataPoint.max && dataPoint.min && dataPoint.avg) {
        const max = parseFloat(dataPoint.max);
        const min = parseFloat(dataPoint.min);
        const avg = parseFloat(dataPoint.avg);
        if (max > maxPrice) {
          maxPrice = max;
        }
        if (min < minPrice) {
          minPrice = min;
        }
        totalPrice += avg;
        numItems++;
      }
    }

    // check in case there is no data
    if (minPrice == Number.MAX_VALUE) {
      minPrice = 0;
    }

    if (numItems > 0) {
      avgPrice = totalPrice / numItems;
    }

    return {
      maxPrice,
      minPrice,
      avgPrice
    };
  }

  async fetchSalesForStatsPeriod(
    collectionAddress: string,
    period: StatsPeriod
  ): Promise<MnemonicVolumesForStatsPeriod> {
    const resp = await this.mnemonicService.getSalesVolumeByContract(collectionAddress, period);
    const dataPoints = resp?.dataPoints ?? [];
    let numSales = 0,
      salesVolume = 0;

    for (const dataPoint of dataPoints) {
      if (dataPoint.count && dataPoint.volume) {
        const count = parseFloat(dataPoint.count);
        const volume = parseFloat(dataPoint.volume);
        numSales += count;
        salesVolume += volume;
      }
    }

    return {
      numSales,
      salesVolume
    };
  }

  async getCollectionHistoricalSales(
    collection: ParsedCollectionId,
    query: CollectionHistoricalSalesQueryDto
  ): Promise<Partial<CollectionHistoricalSale>[]> {
    const timeBucket = query.period;
    const nowTimestamp = Date.now();
    let prevTimestamp = nowTimestamp;
    switch (timeBucket) {
      case HistoricalSalesTimeBucket.ONE_HOUR:
        prevTimestamp = nowTimestamp - 1000 * 60 * 60;
        break;
      case HistoricalSalesTimeBucket.ONE_DAY:
        prevTimestamp = nowTimestamp - 1000 * 60 * 60 * 24;
        break;
      case HistoricalSalesTimeBucket.ONE_WEEK:
        prevTimestamp = nowTimestamp - 1000 * 60 * 60 * 24 * 7;
        break;
      case HistoricalSalesTimeBucket.ONE_MONTH:
        prevTimestamp = nowTimestamp - 1000 * 60 * 60 * 24 * 30;
        break;
      case HistoricalSalesTimeBucket.ONE_YEAR:
        prevTimestamp = nowTimestamp - 1000 * 60 * 60 * 24 * 365;
        break;
      default:
        break;
    }

    const q = `SELECT token_id, sale_price_eth, sale_timestamp, token_image\
       FROM eth_nft_sales \
       WHERE collection_address = '${collection.address}' AND sale_timestamp >= ${prevTimestamp} AND sale_timestamp <= ${nowTimestamp} \
       ORDER BY sale_timestamp DESC LIMIT 1000`;

    const pool = this.postgresService.pool;

    const result = await pool.query(q);
    const data = [];
    for (const row of result.rows) {
      const tokenId = row.token_id;
      const salePriceEth = parseFloat(row.sale_price_eth);
      const timestamp = Number(row.sale_timestamp);
      const tokenImage = row.token_image;

      if (!tokenId || !salePriceEth || !timestamp || !tokenImage) {
        continue;
      }
      
      const dataPoint: Partial<CollectionHistoricalSale> = {
        tokenId,
        salePriceEth,
        timestamp,
        tokenImage
      };

      data.push(dataPoint);
    };

    return data;
  }

  async getCollectionHistoricalStats(
    collection: ParsedCollectionId,
    query: CollectionHistoricalStatsQueryDto
  ): Promise<CollectionStatsArrayResponseDto> {
    const startAfterCursor = this.paginationService.decodeCursorToNumber(query.cursor);
    const orderDirection = query.orderDirection;
    const limit = query.limit;
    const period = query.period;

    let statsQuery = collection.ref
      .collection(this.statsGroup)
      .where('period', '==', period)
      .where('timestamp', '<=', query.maxDate)
      .where('timestamp', '>=', query.minDate)
      .orderBy('timestamp', orderDirection);

    if (!Number.isNaN(startAfterCursor)) {
      statsQuery = statsQuery.startAfter(startAfterCursor);
    }
    statsQuery = statsQuery.limit(limit + 1); // +1 to check if there are more results

    const stats = (await statsQuery.get()).docs.map((item) => item.data()) as Stats[];
    const secondaryStatsPromises = stats.map(async (primaryStat) => {
      return this.getSecondaryStats(primaryStat, this.socialsGroup, query.period, primaryStat.timestamp);
    });

    const secondaryStats = await Promise.allSettled(secondaryStatsPromises);

    const combinedStats = await Promise.all(
      stats.map(async (primary, index) => {
        const secondaryPromiseResult = secondaryStats[index];

        const secondary = secondaryPromiseResult.status === 'fulfilled' ? secondaryPromiseResult.value : undefined;

        const collection = { address: primary?.collectionAddress, chainId: primary?.chainId };
        const merged = await this.mergeStats(primary, secondary, {
          chainId: collection.chainId,
          address: collection.address
        });
        return merged;
      })
    );

    const hasNextPage = combinedStats.length > limit;
    if (hasNextPage) {
      combinedStats.pop(); // Remove the item that was added to check if there are more results
    }
    const cursorTimestamp = combinedStats?.[combinedStats?.length - 1]?.timestamp;
    const cursor = this.paginationService.encodeCursor(cursorTimestamp ?? '');

    return {
      data: combinedStats,
      cursor,
      hasNextPage
    };
  }

  async getCollectionFloorPrice(collection: { address: string; chainId: ChainId }): Promise<number | null> {
    try {
      const floorPrice = await this.alchemyService.getFloorPrice(collection.chainId, collection.address);
      return floorPrice;
    } catch (err) {
      return null;
    }
  }

  async getCollectionStats(
    collection: { address: string; chainId: ChainId },
    options: { period: StatsPeriod; date: number }
  ) {
    const floorPricePromise = safelyWrapPromise(this.getCollectionFloorPrice(collection));
    const collectionRef = await this.firebaseService.getCollectionRef(collection);
    const stats = await this.getCollectionStatsForPeriod(
      collectionRef,
      this.statsGroup,
      options.period,
      options.date,
      true
    );
    const socialStats = await this.getCollectionStatsForPeriod(
      collectionRef,
      this.socialsGroup,
      options.period,
      options.date,
      false
    );

    if (stats && socialStats) {
      const collectionStats = await this.mergeStats(stats, socialStats, collection);
      const floorPrice = await floorPricePromise;
      if (floorPrice != null) {
        collectionStats.floorPrice = floorPrice;
      }
      return collectionStats;
    }

    const floorPrice = await floorPricePromise;
    const collectionStats = new CollectionStatsDto();
    if (floorPrice != null) {
      collectionStats.floorPrice = floorPrice;
    }
    return collectionStats;
  }

  /**
   * Get the current stats and update them if they are stale
   */
  async getCurrentSocialsStats(collectionRef: FirebaseFirestore.DocumentReference, waitForUpdate = false) {
    const mostRecentSocialStats = await this.getMostRecentSocialsStats(collectionRef, StatsPeriod.All);
    if (this.areStatsStale(mostRecentSocialStats)) {
      if (waitForUpdate) {
        const updated = await this.updateSocialsStats(collectionRef);
        if (updated) {
          return updated;
        }
      } else {
        void this.updateSocialsStats(collectionRef);
      }
    }

    return mostRecentSocialStats;
  }

  private async getSecondaryStats(
    primaryStat: Stats | SocialsStats,
    secondaryStatsCollectionName: string,
    period: StatsPeriod,
    timestamp: number
  ) {
    const address = primaryStat.collectionAddress;
    const chainId = primaryStat.chainId;
    const collectionRef = await this.firebaseService.getCollectionRef({ address, chainId });
    const mostRecentStats = await this.getCollectionStatsForPeriod(
      collectionRef,
      secondaryStatsCollectionName,
      period,
      timestamp,
      false
    );
    return mostRecentStats;
  }

  private async mergeStats(
    primary: (Partial<SocialsStats> & Partial<Stats>) | undefined,
    secondary: (Partial<SocialsStats> & Partial<Stats>) | undefined,
    collection: { chainId: ChainId; address: string }
  ): Promise<CollectionStatsDto> {
    const mergeStat = (primary?: number | null, secondary?: number | null) => {
      if (typeof primary === 'number' && !Number.isNaN(primary)) {
        return primary;
      } else if (typeof secondary === 'number' && !Number.isNaN(secondary)) {
        return secondary;
      }

      return NaN;
    };

    const ref = await this.firebaseService.getCollectionRef(collection);

    const collectionPromise = ref.get();

    const [collectionResult] = await Promise.allSettled([collectionPromise]);
    const collectionData = collectionResult.status === 'fulfilled' ? collectionResult.value.data() : {};

    const name = collectionData?.metadata?.name ?? 'Unknown';
    const profileImage = collectionData?.metadata?.profileImage ?? '';
    const hasBlueCheck = collectionData?.hasBlueCheck ?? false;
    const slug = collectionData?.slug ?? '';

    let numSales = mergeStat(primary?.numSales, secondary?.numSales);
    let numNfts = mergeStat(primary?.numNfts, secondary?.numNfts);
    let numOwners = mergeStat(primary?.numOwners, secondary?.numOwners);
    let floorPrice = mergeStat(primary?.floorPrice, secondary?.floorPrice);
    let volume = mergeStat(primary?.volume, secondary?.volume);

    if (Number.isNaN(floorPrice) || Number.isNaN(numOwners) || Number.isNaN(volume) || Number.isNaN(numNfts)) {
      // fetch from reservoir
      try {
        console.log('mergeStats: Fetching stats from reservoir');
        const data = await this.reservoirService.getSingleCollectionInfo(collection.chainId, collection.address);
        if (data) {
          const collection = data.collection;
          if (collection?.tokenCount) {
            numNfts = parseInt(String(collection.tokenCount));
          }
          if (collection?.ownerCount) {
            numOwners = parseInt(String(collection.ownerCount));
          }
          if (collection?.floorAsk) {
            floorPrice = collection.floorAsk.price;
          }
          if (collection?.volume) {
            volume = collection?.volume?.allTime ?? NaN;
          }
        }
      } catch (err) {
        console.error('mergeStats: Error getting floor price from reservoir', err);
      }
    }

    if (Number.isNaN(numNfts) || Number.isNaN(numOwners) || Number.isNaN(volume)) {
      // fetch from zora
      try {
        console.log('mergeStats: Fetching stats from zora');
        const stats = await this.zoraService.getAggregatedCollectionStats(collection.chainId, collection.address, 10);
        if (stats) {
          const data: Partial<CollectionStats> = {};

          if (stats.aggregateStat?.salesVolume?.totalCount) {
            numSales = stats.aggregateStat?.salesVolume?.totalCount;
            data.numSales = numSales;
          }
          if (stats.aggregateStat?.nftCount) {
            numNfts = stats.aggregateStat.nftCount;
            data.numNfts = numNfts;
          }
          if (stats.aggregateStat.ownerCount) {
            numOwners = stats.aggregateStat.ownerCount;
            data.numOwners = numOwners;
          }
          if (stats.aggregateStat?.salesVolume.chainTokenPrice) {
            volume = stats.aggregateStat.salesVolume.chainTokenPrice;
            data.volume = volume;
          }
          if (stats.aggregateStat?.salesVolume.usdcPrice) {
            data.volumeUSDC = stats.aggregateStat.salesVolume.usdcPrice;
          }
          if (stats.aggregateStat?.ownersByCount?.nodes && stats.aggregateStat?.ownersByCount?.nodes.length >= 10) {
            data.topOwnersByOwnedNftsCount = stats.aggregateStat.ownersByCount.nodes;
          }

          if (data) {
            data.updatedAt = Date.now();
          }

          // save to firestore async
          const collectionDocId = getCollectionDocId({
            chainId: collection.chainId,
            collectionAddress: collection.address
          });
          const allTimeCollStatsDocRef = this.firebaseService.firestore
            .collection(firestoreConstants.COLLECTIONS_COLL)
            .doc(collectionDocId)
            .collection(firestoreConstants.COLLECTION_STATS_COLL)
            .doc('all');

          // save
          allTimeCollStatsDocRef.set(data, { merge: true }).catch((err) => {
            console.error('mergeStats: Error saving zora stats', err);
          });
        }
      } catch (err) {
        console.error('mergeStats: Error getting zora data', err);
      }
    }

    if (Number.isNaN(numNfts) || Number.isNaN(numOwners)) {
      numNfts = collectionData?.numNfts ?? NaN;
      numOwners = collectionData?.numOwners ?? NaN;
    }

    const mergedStats: CollectionStatsDto = {
      name,
      slug,
      profileImage,
      bannerImage: collectionData?.metadata?.bannerImage ?? '',
      hasBlueCheck,
      numSales,
      numNfts,
      numOwners,
      floorPrice,
      volume,
      chainId: collection.chainId,
      collectionAddress: collection.address,
      prevFloorPrice: mergeStat(primary?.prevFloorPrice, secondary?.prevFloorPrice),
      floorPricePercentChange: mergeStat(primary?.floorPricePercentChange, secondary?.floorPricePercentChange),
      ceilPrice: mergeStat(primary?.ceilPrice, secondary?.ceilPrice),
      prevCeilPrice: mergeStat(primary?.prevCeilPrice, secondary?.prevCeilPrice),
      ceilPricePercentChange: mergeStat(primary?.ceilPricePercentChange, secondary?.ceilPricePercentChange),
      prevVolume: mergeStat(primary?.prevVolume, secondary?.prevVolume),
      volumePercentChange: mergeStat(primary?.volumePercentChange, secondary?.volumePercentChange),
      prevNumSales: mergeStat(primary?.prevNumSales, secondary?.prevNumSales),
      numSalesPercentChange: mergeStat(primary?.numSalesPercentChange, secondary?.numSalesPercentChange),
      avgPrice: mergeStat(primary?.avgPrice, secondary?.avgPrice),
      avgPricePercentChange: mergeStat(primary?.avgPricePercentChange, secondary?.avgPricePercentChange),
      prevAvgPrice: mergeStat(primary?.prevAvgPrice, secondary?.prevAvgPrice),
      prevDiscordFollowers: mergeStat(primary?.prevDiscordFollowers, secondary?.prevDiscordFollowers),
      discordFollowersPercentChange: mergeStat(
        primary?.discordFollowersPercentChange,
        secondary?.discordFollowersPercentChange
      ),
      discordFollowers: mergeStat(primary?.discordFollowers, secondary?.discordFollowers),
      discordPresence: mergeStat(primary?.discordPresence, secondary?.discordPresence),
      prevDiscordPresence: mergeStat(primary?.prevDiscordPresence, secondary?.prevDiscordPresence),
      discordPresencePercentChange: mergeStat(
        primary?.discordPresencePercentChange,
        secondary?.discordPresencePercentChange
      ),
      prevTwitterFollowers: mergeStat(primary?.prevTwitterFollowers, secondary?.prevTwitterFollowers),
      twitterFollowersPercentChange: mergeStat(
        primary?.twitterFollowersPercentChange,
        secondary?.twitterFollowersPercentChange
      ),
      twitterFollowers: mergeStat(primary?.twitterFollowers, secondary?.twitterFollowers),
      twitterFollowing: mergeStat(primary?.twitterFollowing, secondary?.twitterFollowing),
      prevTwitterFollowing: mergeStat(primary?.prevTwitterFollowing, secondary?.prevTwitterFollowing),
      twitterFollowingPercentChange: mergeStat(
        primary?.twitterFollowingPercentChange,
        secondary?.twitterFollowingPercentChange
      ),
      guildId: primary?.guildId ?? secondary?.guildId ?? '',
      discordLink: primary?.discordLink ?? secondary?.discordLink ?? '',
      twitterId: primary?.twitterId ?? secondary?.twitterId ?? '',
      twitterHandle: primary?.twitterHandle ?? secondary?.twitterHandle ?? '',
      twitterLink: primary?.twitterLink ?? secondary?.twitterLink ?? '',
      updatedAt: primary?.updatedAt ?? NaN,
      timestamp: primary?.timestamp ?? secondary?.timestamp ?? NaN,
      period: primary?.period ?? secondary?.period ?? StatsPeriod.All,
      volumeUSDC: mergeStat(primary?.volumeUSDC, secondary?.volumeUSDC),
      topOwnersByOwnedNftsCount: primary?.topOwnersByOwnedNftsCount ?? secondary?.topOwnersByOwnedNftsCount ?? [],
      minProtocolFeeWei: primary?.minProtocolFeeWei ?? null,
      maxProtocolFeeWei: primary?.maxProtocolFeeWei ?? null,
      avgProtocolFeeWei: primary?.avgProtocolFeeWei ?? null,
      sumProtocolFeeWei: primary?.sumProtocolFeeWei ?? '0',
      numSalesWithProtocolFee: primary?.numSalesWithProtocolFee ?? 0,
      sumProtocolFeeEth: primary?.sumProtocolFeeEth ?? 0
    };

    return mergedStats;
  }

  private async getPrimaryStats(queryOptions: RankingQueryDto, statsGroupName: string) {
    const date = queryOptions.date;
    const { timestamp } = getStatsDocInfo(date, queryOptions.period);
    const collectionGroup = this.firebaseService.firestore.collectionGroup(statsGroupName);

    let startAfter;
    if (queryOptions.cursor) {
      const decodedCursor = this.paginationService.decodeCursor(queryOptions.cursor);
      const [chainId, address] = decodedCursor.split(':');
      const startAfterDocResults = await collectionGroup
        .where('period', '==', queryOptions.period)
        .where('timestamp', '==', timestamp)
        .where('collectionAddress', '==', address)
        .where('chainId', '==', chainId)
        .limit(1)
        .get();
      startAfter = startAfterDocResults.docs[0];
    }

    let query = collectionGroup
      .where('timestamp', '==', timestamp)
      .where('period', '==', queryOptions.period)
      .where(queryOptions.orderBy, '!=', NaN)
      .orderBy(queryOptions.orderBy, queryOptions.orderDirection)
      .orderBy('collectionAddress', 'asc');
    if (startAfter) {
      query = query.startAfter(startAfter);
    }

    query = query.limit(queryOptions.limit + 1); // +1 to check if there are more results

    const res = await query.get();
    const collectionStats = res.docs.map((snapShot) => {
      return snapShot.data();
    }) as Stats[] | SocialsStats[];

    const hasNextPage = collectionStats.length > queryOptions.limit;

    if (hasNextPage) {
      collectionStats.pop();
    }
    const cursorInfo = collectionStats[collectionStats.length - 1];
    let cursor = '';
    if (cursorInfo?.chainId && cursorInfo?.collectionAddress) {
      cursor = this.paginationService.encodeCursor(`${cursorInfo.chainId}:${cursorInfo.collectionAddress}`);
    }

    return { data: collectionStats, cursor, hasNextPage };
  }

  private async getCollectionStatsForPeriod(
    collectionRef: FirebaseFirestore.DocumentReference,
    statsCollectionName: string,
    period: StatsPeriod,
    timestamp: number,
    waitForUpdate = false
  ) {
    try {
      const statsQuery = collectionRef
        .collection(statsCollectionName)
        .where('period', '==', period)
        .where('timestamp', '<=', timestamp)
        .orderBy('timestamp', 'desc')
        .limit(1);
      const snapshot = await statsQuery.get();
      const stats: Partial<Stats> | Partial<SocialsStats> =
        (snapshot.docs?.[0]?.data() as Stats | SocialsStats | undefined) ?? {};
      const requestedTimestamp = getStatsDocInfo(timestamp, period).timestamp;
      const currentTimestamp = getStatsDocInfo(Date.now(), period).timestamp;
      const isMostRecent = requestedTimestamp === currentTimestamp;
      const stale = !!stats?.updatedAt || (stats?.updatedAt && stats?.updatedAt < Date.now() - ONE_HOUR);
      /**
       * Attempt to update socials stats if they're out of date
       */
      if (isMostRecent && stale && statsCollectionName === this.socialsGroup) {
        if (this.areStatsStale(stats)) {
          if (waitForUpdate) {
            const updated = await this.updateSocialsStats(collectionRef, period);
            if (updated) {
              return updated;
            }
          } else {
            void this.updateSocialsStats(collectionRef);
          }
        }
      }
      return stats;
    } catch (err: any) {
      console.error(err);
      return undefined;
    }
  }

  private async updateSocialsStats(
    collectionRef: FirebaseFirestore.DocumentReference,
    period: StatsPeriod = StatsPeriod.All
  ): Promise<SocialsStats | undefined> {
    const collectionData = await collectionRef.get();
    const collection = collectionData?.data() ?? ({} as Partial<Collection>);

    let address = collection.address;
    let chainId = collection.chainId;
    if (!address || !chainId) {
      const collectionId = collectionRef.id;
      const [parsedChainId, parsedAddress] = collectionId.split(':');
      address = parsedAddress;
      chainId = parsedChainId;
      if (!address || !chainId) {
        return;
      }
    }

    let discordPromise = new Promise<
      | undefined
      | {
          discordFollowers: number;
          discordPresence: number;
          guildId: string;
          link: string;
        }
    >((res) => res(undefined));

    let twitterPromise = new Promise<
      | undefined
      | {
          account: InfinityTwitterAccount;
          tweets: InfinityTweet[];
        }
    >((res) => res(undefined));

    if (collection?.metadata?.links?.discord) {
      discordPromise = this.discordService.getGuildStats(collection.metadata.links.discord);
    }

    if (collection?.metadata?.links?.twitter) {
      const username = TwitterService.extractTwitterUsername(collection.metadata.links.twitter);
      twitterPromise = this.twitterService.getAccountAndMentions(username);
    }

    const [discordPromiseResult, twitterPromiseResult] = await Promise.allSettled([discordPromise, twitterPromise]);
    const discordResponse = discordPromiseResult.status === 'fulfilled' ? discordPromiseResult.value : undefined;
    const twitterResponse = twitterPromiseResult.status === 'fulfilled' ? twitterPromiseResult.value : undefined;

    if (twitterResponse?.tweets?.length) {
      void this.twitterService.saveCollectionMentions(collectionRef, twitterResponse?.tweets);
    }

    const discordStats: Pick<
      PreAggregatedSocialsStats,
      'discordFollowers' | 'discordPresence' | 'guildId' | 'discordLink'
    > = {
      discordFollowers: discordResponse?.discordFollowers ?? NaN,
      discordPresence: discordResponse?.discordPresence ?? NaN,
      guildId: discordResponse?.guildId ?? '',
      discordLink: discordResponse?.link ?? ''
    };

    const twitterStats: Pick<
      PreAggregatedSocialsStats,
      'twitterFollowers' | 'twitterFollowing' | 'twitterId' | 'twitterHandle' | 'twitterLink'
    > = {
      twitterFollowers: twitterResponse?.account?.followersCount ?? NaN,
      twitterFollowing: twitterResponse?.account?.followingCount ?? NaN,
      twitterId: twitterResponse?.account?.id ?? '',
      twitterHandle: twitterResponse?.account?.username ?? '',
      twitterLink: twitterResponse?.account?.username
        ? TwitterService.appendTwitterUsername(twitterResponse.account.username.toLowerCase())
        : ''
    };

    const socialsStats: PreAggregatedSocialsStats = {
      collectionAddress: address,
      chainId: chainId,
      ...discordStats,
      ...twitterStats,
      updatedAt: Date.now()
    };

    const allTimeStats = await this.saveSocialsStats(collectionRef, socialsStats, period);
    return allTimeStats;
  }

  private async saveSocialsStats(
    collectionRef: FirebaseFirestore.DocumentReference,
    preAggregatedStats: PreAggregatedSocialsStats,
    periodToReturn: StatsPeriod = StatsPeriod.All
  ): Promise<SocialsStats> {
    const socialsCollection = collectionRef.collection(firestoreConstants.COLLECTION_SOCIALS_STATS_COLL);
    const aggregatedStats = await this.aggregateSocialsStats(collectionRef, preAggregatedStats);
    for (const [, stats] of Object.entries(aggregatedStats)) {
      const { docId } = getStatsDocInfo(stats.timestamp, stats.period);
      const docRef = socialsCollection.doc(docId);
      this.fsBatchHandler.add(docRef, stats, { merge: true });
    }
    await this.fsBatchHandler.flush().catch((err) => {
      console.error('error saving social stats', err);
    });

    return aggregatedStats[periodToReturn];
  }

  private async aggregateSocialsStats(
    collectionRef: FirebaseFirestore.DocumentReference,
    currentStats: PreAggregatedSocialsStats
  ): Promise<Record<StatsPeriod, SocialsStats>> {
    /**
     * Get the most recent stats for each period and store them in a map with the period as the key and the stats as the value
     */
    const statsPeriods = [
      StatsPeriod.Hourly,
      StatsPeriod.Daily,
      StatsPeriod.Weekly,
      StatsPeriod.Monthly,
      StatsPeriod.Yearly,
      StatsPeriod.All
    ];

    const mostRecentStats = statsPeriods.map((period) => {
      const currentTime = getStatsDocInfo(Date.now(), period).timestamp;
      const afterDate = getStatsDocInfo(currentTime - 1000, period).timestamp;
      return this.getMostRecentSocialsStats(collectionRef, period, afterDate);
    });
    const mostRecentStatsResponse = await Promise.all(mostRecentStats);

    const socialsStatsMap: Record<StatsPeriod, SocialsStats | undefined> = {} as any;
    statsPeriods.forEach((period, index) => {
      socialsStatsMap[period] = mostRecentStatsResponse[index];
    });

    const aggregatedStats: Record<StatsPeriod, SocialsStats> = {} as any;
    for (const [period, prevStats] of Object.entries(socialsStatsMap) as [StatsPeriod, SocialsStats | undefined][]) {
      const info = getStatsDocInfo(currentStats.updatedAt, period);
      const prevDiscordFollowers = prevStats?.discordFollowers || currentStats.discordFollowers;
      const currentDiscordFollowers = (currentStats.discordFollowers || prevStats?.discordFollowers) ?? NaN;
      const currentDiscordPresence = (currentStats.discordPresence || prevStats?.discordPresence) ?? NaN;
      const currentTwitterFollowers = (currentStats.twitterFollowers || prevStats?.twitterFollowers) ?? NaN;
      const currentTwitterFollowing = (currentStats.twitterFollowing || prevStats?.twitterFollowing) ?? NaN;
      const discordFollowersPercentChange = calcPercentChange(prevDiscordFollowers, currentDiscordFollowers);
      const prevDiscordPresence = prevStats?.discordPresence || currentStats.discordPresence;
      const discordPresencePercentChange = calcPercentChange(prevDiscordPresence, currentDiscordPresence);
      const prevTwitterFollowers = prevStats?.twitterFollowers || currentStats.twitterFollowers;
      const twitterFollowersPercentChange = calcPercentChange(prevTwitterFollowers, currentTwitterFollowers);
      const prevTwitterFollowing = prevStats?.twitterFollowing || currentStats.twitterFollowing;
      const twitterFollowingPercentChange = calcPercentChange(prevTwitterFollowing, currentTwitterFollowing);

      const stats: SocialsStats = {
        ...currentStats,
        discordFollowers: currentDiscordFollowers,
        discordPresence: currentDiscordPresence,
        twitterFollowers: currentTwitterFollowers,
        twitterFollowing: currentTwitterFollowing,
        timestamp: info.timestamp,
        prevDiscordFollowers,
        discordFollowersPercentChange,
        prevDiscordPresence,
        discordPresencePercentChange,
        prevTwitterFollowers,
        twitterFollowersPercentChange,
        prevTwitterFollowing,
        twitterFollowingPercentChange,
        period: period
      };

      aggregatedStats[period] = stats;
    }

    return aggregatedStats;
  }

  private areStatsStale(stats: Partial<SocialsStats> | undefined): boolean {
    const updatedAt = stats?.timestamp ?? 0;
    const { timestamp } = getStatsDocInfo(updatedAt, StatsPeriod.Hourly);
    const { timestamp: current } = getStatsDocInfo(Date.now(), StatsPeriod.Hourly);
    return timestamp !== current;
  }

  private async getMostRecentSocialsStats(
    collectionRef: FirebaseFirestore.DocumentReference,
    period: StatsPeriod,
    beforeDate?: number
  ) {
    let socialStatsQuery = collectionRef
      .collection(firestoreConstants.COLLECTION_SOCIALS_STATS_COLL)
      .where('period', '==', period);

    if (beforeDate) {
      socialStatsQuery = socialStatsQuery.where('timestamp', '<', beforeDate);
    }

    socialStatsQuery = socialStatsQuery.orderBy('timestamp', 'desc').limit(1);
    const snapshot = await socialStatsQuery.get();
    const stats = snapshot.docs?.[0]?.data();
    return stats as SocialsStats | undefined;
  }

  private getStatsCollectionNames(statType: StatType) {
    const collectionGroupNames = this.socialsStats.includes(statType)
      ? { primary: this.socialsGroup, secondary: this.statsGroup }
      : { primary: this.statsGroup, secondary: this.socialsGroup };
    return collectionGroupNames;
  }
}
