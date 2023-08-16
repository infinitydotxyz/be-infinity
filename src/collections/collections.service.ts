import {
  ChainId,
  Collection,
  CollectionMetadata,
  CollectionPeriodStatsContent,
  CollectionSaleAndOrder,
  CollectionStats,
  CurrentCurationSnippetDoc,
  SupportedCollection,
  TopOwner
} from '@infinityxyz/lib/types/core';
import { TopOwnerDto, TopOwnersQueryDto } from '@infinityxyz/lib/types/dto/collections';
import { ExternalNftCollectionDto, NftCollectionDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { reservoirCollToERC721CollectionAndStats } from 'common/utils';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { ReservoirOrderDepth } from 'reservoir/types';
import { StatsService } from 'stats/stats.service';
import { MatchingEngineService } from 'v2/matching-engine/matching-engine.service';
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
    protected matchingEngineService: MatchingEngineService
  ) {}

  private get defaultCollectionQueryOptions(): CollectionQueryOptions {
    return {
      limitToCompleteCollections: false
    };
  }

  async defaultGoerliColls(): Promise<CollectionPeriodStatsContent[]> {
    const chainId = '5';
    const collectionAddresses = [
      '0x29b969f3aba9a1e2861a3190ec9057b3989fe85d',
      '0xe29f8038d1a3445ab22ad1373c65ec0a6e1161a4',
      '0x09e8617f391c54530cc2d3762ceb1da9f840c5a3',
      '0xfc4cd5d102f296069a05f92843f3451c44073b22',
      '0x06f36c3f77973317bea50363a0f66646bced7319',
      '0x10b8b56d53bfa5e374f38e6c0830bad4ebee33e6'
    ];
    const collsRef = this.firebaseService.firestore.collection(firestoreConstants.COLLECTIONS_COLL);
    const collDocIds = collectionAddresses.map((collectionAddress) =>
      getCollectionDocId({ chainId, collectionAddress })
    );
    const collAllTimeStatsRefs = collDocIds.map((collDocId) =>
      collsRef.doc(collDocId).collection(firestoreConstants.COLLECTION_STATS_COLL).doc('all')
    );
    const statsSnap = await this.firebaseService.firestore.getAll(...collAllTimeStatsRefs);
    const colls: CollectionPeriodStatsContent[] = [];
    for (const statSnap of statsSnap) {
      const data = statSnap.data();
      if (!data) {
        continue;
      }
      const stats: CollectionPeriodStatsContent = {
        contractAddress: data.collectionAddress,
        chainId: data.chainId,
        tokenCount: data.numNfts,
        salesVolume: data.volume,
        salesVolumeChange: NaN,
        floorPrice: data.floorPrice,
        floorPriceChange: NaN
      };
      colls.push(stats);
    }
    return colls;
  }

  async fetchSupportedColls(chainId: string): Promise<SupportedCollection[]> {
    const supportedCollsRef = this.firebaseService.firestore
      .collection(firestoreConstants.SUPPORTED_COLLECTIONS_COLL)
      .where('chainId', '==', chainId)
      .where('isSupported', '==', true)
      .limit(100); // future-todo: pagination
    const querySnapshot = await supportedCollsRef.get();
    const supportedColls = querySnapshot.docs.map((doc) => doc.data() as SupportedCollection);
    return supportedColls;
  }

  async getOrderDepth(
    collection: ParsedCollectionId
  ): Promise<{ buy: ReservoirOrderDepth | undefined; sell: ReservoirOrderDepth | undefined }> {
    const chainId = collection.chainId;
    const collectionAddress = collection.address;
    const buyOrderDepth = await this.reservoirService.getOrderDepth(chainId, collectionAddress, 'buy');
    const sellOrderDepth = await this.reservoirService.getOrderDepth(chainId, collectionAddress, 'sell');
    return {
      buy: buyOrderDepth,
      sell: sellOrderDepth
    };
  }

  async getRecentSalesAndOrders(collection: ParsedCollectionId): Promise<CollectionSaleAndOrder[]> {
    const data: CollectionSaleAndOrder[] = [];
    const chainId = collection.chainId;
    const collectionAddress = collection.address;

    const sales = await this.reservoirService.getSales(chainId, collectionAddress);
    const listings = await this.reservoirService.getOrders(
      chainId,
      collectionAddress,
      undefined,
      undefined,
      undefined,
      'sell',
      false,
      'updatedAt'
    );
    const bids = await this.reservoirService.getOrders(
      chainId,
      collectionAddress,
      undefined,
      undefined,
      undefined,
      'buy',
      false,
      'updatedAt'
    );

    for (const sale of sales?.sales || []) {
      const tokenId = sale.token.tokenId;
      const priceEth = sale.price.amount.native;
      const timestamp = sale.timestamp * 1000;
      const tokenImage = sale.token.image;
      const id = sale.id;

      if (!priceEth || !timestamp || !tokenId || !tokenImage) {
        continue;
      }

      const dataPoint: CollectionSaleAndOrder = {
        dataType: 'Sale',
        priceEth,
        timestamp,
        tokenId,
        tokenImage,
        id,
        executionStatus: null
      };

      data.push(dataPoint);
    }

    for (const listing of listings?.orders || []) {
      const priceEth = listing.price.amount.native;
      const timestamp = new Date(listing.updatedAt).getTime();
      const id = listing.id;
      const tokenId = listing.criteria?.data?.token?.tokenId;
      const tokenImage = listing.criteria?.data?.token?.image;

      if (!priceEth || !timestamp || !tokenId || !tokenImage) {
        continue;
      }

      const dataPoint: CollectionSaleAndOrder = {
        dataType: 'Listing',
        priceEth,
        timestamp,
        id,
        tokenId,
        tokenImage,
        executionStatus: null
      };

      data.push(dataPoint);
    }

    for (const bid of bids?.orders || []) {
      const priceEth = bid.price.amount.native;
      const timestamp = new Date(bid.updatedAt).getTime();
      const id = bid.id;
      const isCollBid = bid.criteria?.kind === 'collection';
      const isAttrBid = bid.criteria?.kind === 'attribute';
      const tokenTitle = isCollBid ? 'Collection Bid' : isAttrBid ? 'Trait Bid' : bid.criteria?.data?.token?.tokenId;
      const image = isCollBid
        ? bid.criteria?.data?.collection?.image
        : isAttrBid
        ? ''
        : bid.criteria?.data?.token?.image;

      if (!priceEth || !timestamp || !tokenTitle) {
        continue;
      }

      const dataPoint: CollectionSaleAndOrder = {
        dataType: 'Offer',
        priceEth,
        timestamp,
        id,
        tokenId: tokenTitle,
        tokenImage: image,
        executionStatus: null
      };

      data.push(dataPoint);
    }

    return data;
  }

  async getTopOwners(collection: ParsedCollectionId, query: TopOwnersQueryDto) {
    const collectionData = (await collection.ref.get()).data();
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: CollectionQueryOptions
  ): Promise<Collection & Partial<CollectionStats> | undefined> {
    const data = await this.reservoirService.getSingleCollectionInfo(collection.chainId, collection.address);
    const first = data?.collections?.[0];
    return first ? reservoirCollToERC721CollectionAndStats(collection.chainId, first) : undefined;
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
