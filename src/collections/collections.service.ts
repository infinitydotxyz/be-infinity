import {
  ChainId,
  Collection,
  CollectionMetadata,
  CollectionSaleAndOrder,
  CreationFlow,
  CurrentCurationSnippetDoc, TopOwner
} from '@infinityxyz/lib/types/core';
import { TopOwnerDto, TopOwnersQueryDto } from '@infinityxyz/lib/types/dto/collections';
import { ExternalNftCollectionDto, NftCollectionDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { PostgresService } from 'postgres/postgres.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { StatsService } from 'stats/stats.service';
import { ZoraService } from 'zora/zora.service';
import { ONE_DAY } from '../constants';
import { ParsedCollectionId } from './collection-id.pipe';

interface CollectionQueryOptions {
  /**
   * Only show collections that have been fully indexed
   *
   * Defaults to `true`.
   */
  limitToCompleteCollections: boolean;
}

@Injectable()
export default class CollectionsService {
  constructor(
    private firebaseService: FirebaseService,
    private zoraService: ZoraService,
    private reservoirService: ReservoirService,
    private paginationService: CursorService,
    private statsService: StatsService,
    private postgresService: PostgresService
  ) {}

  private get defaultCollectionQueryOptions(): CollectionQueryOptions {
    return {
      limitToCompleteCollections: false
    };
  }

  async getRecentSalesAndOrders(collection: ParsedCollectionId): Promise<CollectionSaleAndOrder[]> {
    const pool = this.postgresService.pool;
    const data: CollectionSaleAndOrder[] = [];

    const salesQuery = `SELECT txhash, log_index, token_id, token_image, sale_price_eth, sale_timestamp\
       FROM eth_nft_sales \
       WHERE collection_address = '${collection.address}' \
       ORDER BY sale_timestamp DESC LIMIT 20`;
    const salesResult = await pool.query(salesQuery);
    for (const sale of salesResult.rows) {
      const tokenId = sale.token_id;
      const priceEth = parseFloat(sale.sale_price_eth);
      const timestamp = Number(sale.sale_timestamp);
      const tokenImage = sale.token_image;
      const log_index = Number(sale.log_index);
      const txHash = sale.txhash;
      const id = `${txHash}-${log_index}`;

      if (!priceEth || !timestamp || !tokenId || !tokenImage) {
        continue;
      }

      const dataPoint: CollectionSaleAndOrder = {
        dataType: 'Sale',
        priceEth,
        timestamp,
        tokenId,
        tokenImage,
        id
      };

      data.push(dataPoint);
    }

    const ordersQuery = `SELECT id, token_id, token_image, price_eth, is_sell_order, start_time_millis\
       FROM eth_nft_orders \
       WHERE collection_address = '${collection.address}' AND status = 'active' \
       ORDER BY start_time_millis DESC LIMIT 20`;
    const ordersResult = await pool.query(ordersQuery);
    for (const order of ordersResult.rows) {
      const priceEth = parseFloat(order.price_eth);
      const timestamp = Number(order.start_time_millis);
      const isSellOrder = Boolean(order.is_sell_order);
      const id = order.id;
      const tokenId = order.token_id;
      const tokenImage = order.token_image;

      if (!priceEth || !timestamp) {
        continue;
      }

      const dataPoint: CollectionSaleAndOrder = {
        dataType: isSellOrder ? 'Listing' : 'Offer',
        priceEth,
        timestamp,
        id,
        tokenId,
        tokenImage
      };

      data.push(dataPoint);
    }

    return data;
  }

  async getTopOwners(collection: ParsedCollectionId, query: TopOwnersQueryDto) {
    const collectionData = (await collection.ref.get()).data();
    // if (collectionData?.state?.create?.step !== CreationFlow.Complete) {
    //   throw new InvalidCollectionError(collection.address, collection.chainId, 'Collection is not complete');
    // }

    const offset = this.paginationService.decodeCursorToNumber(query.cursor || '');

    let topOwners: TopOwner[] = [];
    // check if data exists in firestore
    const collectionDocId = getCollectionDocId({ collectionAddress: collection.address, chainId: collection.chainId });
    const allStatsDocRef = this.firebaseService.firestore
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(collectionDocId)
      .collection(firestoreConstants.COLLECTION_STATS_COLL)
      .doc('all');
    const allStatsDoc = await allStatsDocRef.get();

    let topOwnersLastUpdated = 0;
    if (allStatsDoc.exists) {
      topOwners = allStatsDoc.data()?.topOwnersByOwnedNftsCount as TopOwner[];
      topOwnersLastUpdated = allStatsDoc.data()?.topOwnersLastUpdated;

      // make sure not undefined from above
      topOwners = topOwners ?? [];
    }

    // if data doesn't exist in firestore or if stale, refetch
    const isStale = Date.now() - topOwnersLastUpdated > ONE_DAY;
    if (!topOwners || topOwners.length === 0 || isStale) {
      try {
        topOwners = await this.refetchTopOwners(collection);
        allStatsDocRef.set({ topOwnersLastUpdated: Date.now() }, { merge: true }).catch(console.error);
      } catch (e) {
        console.error('Error re-fetching top owners for collection', collection.chainId + ':' + collection.address);
      }
    }

    if (!topOwners || topOwners.length === 0) {
      console.error('Error fetching top owners for collection', collection.chainId + ':' + collection.address);
      return null;
    }

    // async store in firestore
    allStatsDocRef.set({ topOwnersByOwnedNftsCount: topOwners }, { merge: true }).catch(console.error);

    // don't return more than limit
    if (topOwners.length > query.limit) {
      topOwners = topOwners.slice(0, query.limit);
    }

    const hasNextPage = topOwners.length > query.limit;
    const updatedOffset = topOwners.length + offset;
    const cursor = this.paginationService.encodeCursor(updatedOffset);

    const numNfts = (collectionData as Collection)?.numNfts;

    const transformedData = topOwners.map((owner) => {
      const topOwner: TopOwnerDto = {
        ownerAddress: owner.owner,
        ownedCount: owner.count,
        percentOwned: Math.floor((owner.count / numNfts) * 1_000_000) / 10_000,
        numNfts
      };
      return topOwner;
    });

    return {
      cursor,
      hasNextPage,
      data: transformedData
    };
  }

  async refetchTopOwners(collection: { address: string; chainId: ChainId }): Promise<TopOwner[]> {
    const topOwners: TopOwner[] = [];

    // first try fetching from zora
    const topOwnersZora = await this.zoraService.getAggregatedCollectionStats(
      collection.chainId,
      collection.address,
      10
    );
    const owners = topOwnersZora?.aggregateStat.ownersByCount.nodes ?? [];
    for (const owner of owners) {
      topOwners.push({
        owner: owner.owner,
        count: owner.count
      });
    }

    // if zora data is null, fetch from reservoir
    if (!topOwners || topOwners.length === 0) {
      const topOwnersReservoir = await this.reservoirService.getCollectionTopOwners(
        collection.chainId,
        collection.address,
        0,
        10
      );
      const owners = topOwnersReservoir?.owners ?? [];
      for (const owner of owners) {
        topOwners.push({
          owner: owner.address,
          count: parseInt(owner.ownership.tokenCount)
        });
      }
    }

    return topOwners;
  }

  async getTopCollection(stakerContractAddress: string, stakerContractChainId: string) {
    const snap = await this.firebaseService.firestore
      .collectionGroup('curationSnippets')
      .where('metadata.stakerContractAddress', '==', stakerContractAddress)
      .where('metadata.stakerContractChainId', '==', stakerContractChainId)
      .orderBy('stats.numCuratorVotes', 'desc')
      .orderBy('metadata.collectionAddress', 'desc')
      .limit(1)
      .get();
    return snap.docs[0]?.data() as CurrentCurationSnippetDoc | null;
  }

  /**
   * Queries for a collection via address
   */
  async getCollectionByAddress(
    collection: { address: string; chainId: string },
    options?: CollectionQueryOptions
  ): Promise<Collection | undefined> {
    const queryOptions = options ?? this.defaultCollectionQueryOptions;
    const docId = getCollectionDocId({ collectionAddress: collection.address, chainId: collection.chainId });

    const collectionSnapshot = await this.firebaseService.firestore
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(docId)
      .get();

    const result = collectionSnapshot.data();

    if (queryOptions.limitToCompleteCollections && result?.state?.create?.step !== CreationFlow.Complete) {
      return undefined;
    }
    return result as Collection;
  }

  async getFloorPrice(collection: { address: string; chainId: ChainId }): Promise<number | null> {
    const floorPrice = await this.statsService.getCollectionFloorPrice(collection);
    if (typeof floorPrice === 'number') {
      return floorPrice;
    }
    return null;
  }

  async getCollectionsByAddress(collections: { address: string; chainId: ChainId }[]) {
    const docIds = [
      ...new Set(
        collections.map((collection) => {
          try {
            return getCollectionDocId({ collectionAddress: collection.address, chainId: collection.chainId });
          } catch (err) {
            return null;
          }
        })
      )
    ].filter((item) => item !== null) as string[];

    const collectionRefs = docIds.map((docId) =>
      this.firebaseService.firestore.collection(firestoreConstants.COLLECTIONS_COLL).doc(docId)
    );

    const getCollection = (coll: { address: string; chainId: string }) => {
      try {
        const collection =
          collectionMap[getCollectionDocId({ collectionAddress: coll.address, chainId: coll.chainId })] ?? {};
        return collection;
      } catch (err) {
        return {};
      }
    };

    if (collectionRefs.length === 0) {
      return { getCollection };
    }

    const collectionsSnap = await this.firebaseService.firestore.getAll(...collectionRefs);

    const collectionMap: { [id: string]: Partial<Collection> } = {};
    collectionsSnap.forEach((item, index) => {
      const docId = docIds[index];
      collectionMap[docId] = (item.data() ?? {}) as Partial<Collection>;
    });

    return { getCollection };
  }

  async setCollectionMetadata(collection: ParsedCollectionId, metadata: CollectionMetadata) {
    if (metadata?.links?.twitter) {
      metadata.links.twitter = metadata.links.twitter.toLowerCase();
    }
    await collection.ref.set({ metadata }, { merge: true });
  }

  /**
   * Verify whether the given user address is the deployer/creator of the collection.
   */
  async isDeployer(userAddress: string, { ref }: ParsedCollectionId) {
    const document = await ref.get();
    const data = document.data();
    return userAddress === data?.deployer;
  }

  /**
   * Verify whether the given user address is an editor of the collection.
   */
  async isEditor(userAddress: string, { ref }: ParsedCollectionId) {
    const editorsDocRef = ref.collection(firestoreConstants.AUTH_COLL).doc(firestoreConstants.EDITORS_DOC);
    const document = await editorsDocRef.get();
    const data = document.data();

    return data?.[userAddress]?.authorized == true;
  }

  /**
   * Verify whether the given user address is an administrator of the infinity platform.
   */
  async isAdmin(userAddress: string) {
    const adminDocRef = this.firebaseService.firestore
      .collection(firestoreConstants.AUTH_COLL)
      .doc(firestoreConstants.ADMINS_DOC);
    const document = await adminDocRef.get();
    const data = document.data();
    return data?.[userAddress]?.authorized == true;
  }

  /**
   * Verify whether the given user address can modify the collection.
   */
  async canModify(userAddress: string, parsedCollection: ParsedCollectionId) {
    return (
      (await this.isDeployer(userAddress, parsedCollection)) ||
      (await this.isEditor(userAddress, parsedCollection)) ||
      (await this.isAdmin(userAddress))
    );
  }

  isSupported(collections: NftCollectionDto[]) {
    // const { getCollection } = await this.getCollectionsByAddress(
    //   collections.map((collection) => ({ address: collection.collectionAddress ?? '', chainId: collection.chainId }))
    // );

    const externalCollection: ExternalNftCollectionDto[] = collections.map((item) => {
      // const collection = getCollection({ address: item.collectionAddress ?? '', chainId: item.chainId });
      // const isSupported = collection?.state?.create?.step === CreationFlow.Complete;
      const isSupported = true;
      const externalCollection: ExternalNftCollectionDto = {
        ...item,
        isSupported
      };
      return externalCollection;
    });

    return externalCollection;
  }
}
