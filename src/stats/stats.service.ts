import {
  BaseCollection,
  ChainId,
  Collection,
  CollectionHistoricalSale,
  CollectionOrder,
  CollectionPeriodStatsContent,
  CollectionStats,
  PreAggregatedSocialsStats,
  StatsPeriod,
  StatType
} from '@infinityxyz/lib/types/core';
import { CollectionStatsDto } from '@infinityxyz/lib/types/dto/stats';
import { ReservoirCollectionV5, ReservoirCollsSortBy } from '@infinityxyz/lib/types/services/reservoir';
import { InfinityTweet, InfinityTwitterAccount } from '@infinityxyz/lib/types/services/twitter';
import { firestoreConstants, getCollectionDocId, sleep } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { AlchemyService } from 'alchemy/alchemy.service';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { PostgresService } from 'postgres/postgres.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { ZoraService } from 'zora/zora.service';
import { DiscordService } from '../discord/discord.service';
import { FirebaseService } from '../firebase/firebase.service';
import { TwitterService } from '../twitter/twitter.service';

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
    private zoraService: ZoraService,
    private reservoirService: ReservoirService,
    private alchemyService: AlchemyService,
    private postgresService: PostgresService
  ) {
    this.fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
  }

  async fetchAndStoreTopCollectionsFromReservoir(): Promise<void> {
    const shouldFetchNew = await this.checkAndDeleteStaleTrendingCollections();

    if (shouldFetchNew) {
      console.log('Fetching new trending collections');

      const trendingCollectionsRef = this.firebaseService.firestore.collection(
        firestoreConstants.TRENDING_COLLECTIONS_COLL
      );
      const byParamDoc = firestoreConstants.TRENDING_BY_VOLUME_DOC;
      const byParamDocRef = trendingCollectionsRef.doc(byParamDoc);

      const topColls1d = await this.fetchTop100Colls(ChainId.Mainnet, ReservoirCollsSortBy.ONE_DAY_VOLUME);
      const topColls7d = await this.fetchTop100Colls(ChainId.Mainnet, ReservoirCollsSortBy.SEVEN_DAY_VOLUME);
      const topColls30d = await this.fetchTop100Colls(ChainId.Mainnet, ReservoirCollsSortBy.THIRTY_DAY_VOLUME);
      const topCollsAllTime = await this.fetchTop100Colls(ChainId.Mainnet, ReservoirCollsSortBy.ALL_TIME_VOLUME);

      const map = new Map<string, ReservoirCollectionV5[]>();
      map.set(StatsPeriod.Daily, topColls1d);
      map.set(StatsPeriod.Weekly, topColls7d);
      map.set(StatsPeriod.Monthly, topColls30d);
      map.set(StatsPeriod.All, topCollsAllTime);

      for (const key of map.keys()) {
        const colls = map.get(key);
        if (!colls) {
          continue;
        }
        for (const coll of colls) {
          if (!coll.primaryContract) {
            continue;
          }

          const collectionDocId = getCollectionDocId({
            chainId: ChainId.Mainnet,
            collectionAddress: coll.primaryContract
          });
          const byPeriodCollectionRef = byParamDocRef.collection(key);
          const trendingCollectionDocRef = byPeriodCollectionRef.doc(collectionDocId);

          const salesVolume =
            key == StatsPeriod.Daily
              ? coll.volume['1day']
              : key == StatsPeriod.Weekly
              ? coll.volume['7day']
              : key == StatsPeriod.Monthly
              ? coll.volume['30day']
              : coll.volume['allTime'];

          const floorSaleChange =
            key == StatsPeriod.Daily
              ? coll.floorSaleChange?.['1day']
              : key == StatsPeriod.Weekly
              ? coll.floorSaleChange?.['7day']
              : coll.floorSaleChange?.['30day'];

          const volumeChange =
            key == StatsPeriod.Daily
              ? coll.volumeChange?.['1day']
              : key == StatsPeriod.Weekly
              ? coll.volumeChange?.['7day']
              : coll.volumeChange?.['30day'];

          const dataToStore: CollectionPeriodStatsContent = {
            chainId: ChainId.Mainnet,
            contractAddress: coll.primaryContract,
            period: key,
            salesVolume: Number(salesVolume),
            salesVolumeChange: Number(volumeChange),
            floorPrice: coll.floorAsk?.price?.amount?.native,
            floorPriceChange: Number(floorSaleChange),
            tokenCount: Number(coll.tokenCount),
            updatedAt: Date.now()
          };

          this.fsBatchHandler.add(trendingCollectionDocRef, dataToStore, { merge: true });
        }
      }

      this.fsBatchHandler.flush().catch((err) => console.error('error saving trending colls', err));
    } else {
      console.log('No need to fetch new trending collections');
    }
  }

  async checkAndDeleteStaleTrendingCollections(): Promise<boolean> {
    const TRENDING_COLLS_TTS = 1000 * 60 * 30; // time to stale - 30 mins
    console.log('Checking and deleting stale trending collections');
    const db = this.firebaseService.firestore;
    try {
      const MAX_RETRY_ATTEMPTS = 5;
      const bulkWriter = db.bulkWriter();
      bulkWriter.onWriteError((error) => {
        if (error.failedAttempts < MAX_RETRY_ATTEMPTS) {
          return true;
        } else {
          console.log('Failed to delete document: ', error.documentRef.path);
          return false;
        }
      });

      const trendingCollectionsRef = db.collection(firestoreConstants.TRENDING_COLLECTIONS_COLL);
      const trendingCollectionsByVolumeDocRef = trendingCollectionsRef.doc(firestoreConstants.TRENDING_BY_VOLUME_DOC);
      const lastUpdatedAt = (await trendingCollectionsByVolumeDocRef.get()).data()?.updatedAt;
      if (typeof lastUpdatedAt !== 'number' || Date.now() - lastUpdatedAt > TRENDING_COLLS_TTS) {
        await db.recursiveDelete(trendingCollectionsRef, bulkWriter);
        await bulkWriter.flush();
        console.log('Deleted old trending collections');
        // add new updatedAt timestamp
        await trendingCollectionsByVolumeDocRef.set({ updatedAt: Date.now() });
        return true;
      }
    } catch (err) {
      console.error('Failed deleting old trending collection', err);
    }
    return false;
  }

  async fetchTop100Colls(chainId: ChainId, period: ReservoirCollsSortBy): Promise<ReservoirCollectionV5[]> {
    const allResults: ReservoirCollectionV5[] = [];
    let continuation = '';
    for (let i = 0; i < 5; i++) {
      console.log('Sleeping for a few seconds to avoid 429s...');
      await sleep(1 * 1000); // to avoid 429s
      const data = await this.reservoirService.getTopCollsByVolume(
        chainId,
        period,
        20, // max reservoir limit is 20
        continuation
      );
      allResults.push(...(data?.collections ?? []));
      continuation = data?.continuation ?? '';
    }

    return allResults;
  }

  async getCollectionHistoricalSales(collection: ParsedCollectionId): Promise<Partial<CollectionHistoricalSale>[]> {
    const timestamp = Date.now() - 1000 * 60 * 60 * 24 * 30; // 30 days ago
    const q = `SELECT token_id, sale_price_eth, sale_timestamp, token_image\
       FROM eth_nft_sales \
       WHERE collection_address = '${collection.address}' AND sale_timestamp > '${timestamp}'\
       ORDER BY sale_timestamp DESC LIMIT 2000`;

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
    }

    return data;
  }

  async getCollectionOrders(collection: ParsedCollectionId): Promise<CollectionOrder[]> {
    const q = `SELECT id, token_id, maker, is_private, token_image, price_eth, is_sell_order\
       FROM eth_nft_orders \
       WHERE collection_address = '${collection.address}' AND status = 'active' \
       LIMIT 1000`;

    const pool = this.postgresService.pool;

    const result = await pool.query(q);
    const data: CollectionOrder[] = [];
    for (const order of result.rows) {
      const id = order.id;
      const tokenId = order.token_id;
      const priceEth = parseFloat(order.price_eth);
      const isSellOrder = Boolean(order.is_sell_order);
      const tokenImage = order.token_image;
      const maker = order.maker;
      const isPrivate = Boolean(order.is_private);

      if (!priceEth) {
        continue;
      }

      const dataPoint: CollectionOrder = {
        id,
        tokenId,
        priceEth,
        isSellOrder,
        tokenImage,
        maker,
        isPrivate
      };

      data.push(dataPoint);
    }

    return data;
  }

  async getCollFloorAndCreator(collection: ParsedCollectionId): Promise<{ floorPrice: number; creator: string }> {
    const period = 'all';
    const statsQuery = collection.ref.collection(this.statsGroup).doc(period);

    const trendingStatsRef = collection.ref.firestore.doc(
      `/trendingCollections/bySalesVolume/daily/${collection.ref.id}`
    );

    const collRef = collection.ref.firestore.doc(`/collections/${collection.ref.id}`);

    const [primarySnap, trendingStatsSnap, collSnap] = await this.firebaseService.firestore.getAll(statsQuery, trendingStatsRef, collRef);
    const primary = (primarySnap.data() ?? {}) as CollectionStats;
    const trendingStats = trendingStatsSnap.data() ?? {};
    const collData = (collSnap.data() ?? {}) as BaseCollection;

    const floorPrice = trendingStats?.floorPrice ?? primary?.floorPrice ?? NaN;
    const creator = collData?.deployer ?? '';

    return {
      floorPrice,
      creator
    }
  }

  async getCollAllStats(collection: ParsedCollectionId): Promise<Partial<CollectionStatsDto>> {
    const period = 'all';
    const statsQuery = collection.ref.collection(this.statsGroup).doc(period);

    const trendingStatsRef = collection.ref.firestore.doc(
      `/trendingCollections/bySalesVolume/daily/${collection.ref.id}`
    );

    const [primarySnap, trendingStatsSnap] = await this.firebaseService.firestore.getAll(statsQuery, trendingStatsRef);
    const primary = (primarySnap.data() ?? {}) as CollectionStats;
    const trendingStats = trendingStatsSnap.data() ?? {};

    let numSales = primary?.numSales ?? NaN;
    let numNfts = primary?.numNfts ?? NaN;
    let numOwners = primary?.numOwners ?? NaN;
    let floorPrice = trendingStats?.floorPrice ?? primary?.floorPrice ?? NaN;
    let volume = primary?.volume ?? NaN;

    const discordFollowers = primary?.discordFollowers ?? NaN;
    const twitterFollowers = primary?.twitterFollowers ?? NaN;
    const prevDiscordFollowers = primary?.prevDiscordFollowers ?? NaN;

    if (isNaN(twitterFollowers) || isNaN(discordFollowers)) {
      this.updateSocialsStats(collection.ref).catch((err) => {
        console.error('Failed updating socials stats', err);
      });
    }

    const collectionDocId = getCollectionDocId({
      chainId: collection.chainId,
      collectionAddress: collection.address
    });
    const allTimeCollStatsDocRef = this.firebaseService.firestore
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(collectionDocId)
      .collection(firestoreConstants.COLLECTION_STATS_COLL)
      .doc('all');

    if (floorPrice === 0 || isNaN(floorPrice) || isNaN(numOwners) || isNaN(volume) || isNaN(numNfts)) {
      // fetch from reservoir
      try {
        console.log('Fetching stats from reservoir for collection', collection.chainId, collection.address);
        const data = await this.reservoirService.getSingleCollectionInfo(collection.chainId, collection.address);
        if (data && data.collections && data.collections[0]) {
          const collection = data.collections[0];
          if (collection?.tokenCount) {
            numNfts = parseInt(String(collection.tokenCount));
          }
          if (collection?.ownerCount) {
            numOwners = parseInt(String(collection.ownerCount));
          }
          if (collection?.floorAsk) {
            floorPrice = collection.floorAsk.price?.amount?.native;
          }
          if (collection?.volume) {
            volume =
              typeof collection?.volume?.allTime === 'string'
                ? parseFloat(collection.volume.allTime)
                : collection?.volume?.allTime ?? NaN;
          }

          // save
          const dataToSave: Partial<CollectionStats> = {
            numNfts,
            numOwners,
            floorPrice,
            volume
          };
          allTimeCollStatsDocRef.set(dataToSave, { merge: true }).catch((err) => {
            console.error('Error saving reservoir stats', err);
          });
        }
      } catch (err) {
        console.error('Error getting floor price from reservoir', err);
      }
    }

    if (isNaN(numNfts) || isNaN(numOwners) || isNaN(volume)) {
      // fetch from zora
      try {
        console.log('Fetching stats from zora for collection', collection.chainId, collection.address);
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

          // save
          allTimeCollStatsDocRef.set(data, { merge: true }).catch((err) => {
            console.error('Error saving zora stats', err);
          });
        }
      } catch (err) {
        console.error('Error getting zora data', err);
      }
    }

    const stats: Partial<CollectionStatsDto> = {
      numSales,
      numNfts,
      numOwners,
      floorPrice,
      volume,
      chainId: collection.chainId,
      collectionAddress: collection.address,
      discordFollowers,
      twitterFollowers,
      prevDiscordFollowers
    };

    return stats;
  }

  async getCollectionFloorPrice(collection: { address: string; chainId: ChainId }): Promise<number | null> {
    try {
      const floorPrice = await this.alchemyService.getFloorPrice(collection.chainId, collection.address);
      return floorPrice;
    } catch (err) {
      return null;
    }
  }

  async refreshSocialsStats(collectionRef: FirebaseFirestore.DocumentReference) {
    const stats = (
      await collectionRef.collection(firestoreConstants.COLLECTION_STATS_COLL).doc(StatsPeriod.All).get()
    ).data() as CollectionStats;

    const socialLastUpdated = stats?.socialStatsUpdatedAt ?? 0;

    if (Date.now() - socialLastUpdated > 1000 * 60 * 60 * 24) {
      // one day
      this.updateSocialsStats(collectionRef).catch((err) => {
        console.error('Error updating socials stats', err);
      });
    }

    return stats;
  }

  private async updateSocialsStats(collectionRef: FirebaseFirestore.DocumentReference): Promise<void> {
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
      socialStatsUpdatedAt: Date.now()
    };

    const statsDoc = collectionRef.collection(firestoreConstants.COLLECTION_STATS_COLL).doc(StatsPeriod.All);
    statsDoc.set(socialsStats, { merge: true }).catch((err) => {
      console.error('Error updating socials stats', err);
    });
  }
}
