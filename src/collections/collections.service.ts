import {
  ChainId,
  Collection,
  CollectionMetadata,
  CreationFlow,
  CurationBlockUser,
  CurrentCurationSnippetDoc,
  StatsPeriod,
  TopOwner
} from '@infinityxyz/lib/types/core';
import {
  TopOwnerDto,
  TopOwnersQueryDto,
  UserCuratedCollectionDto,
  UserCuratedCollectionsDto
} from '@infinityxyz/lib/types/dto/collections';
import {
  CuratedCollectionsOrderBy,
  CuratedCollectionsQuery
} from '@infinityxyz/lib/types/dto/collections/curation/curated-collections-query.dto';
import { ExternalNftCollectionDto, NftCollectionDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { BackfillService } from 'backfill/backfill.service';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { StatsService } from 'stats/stats.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ZoraService } from 'zora/zora.service';
import { ParsedCollectionId } from './collection-id.pipe';
import { CurationService } from './curation/curation.service';
import { ONE_DAY } from '../constants';

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
    private backfillService: BackfillService,
    private curationService: CurationService,
    private statsService: StatsService
  ) {}

  private get defaultCollectionQueryOptions(): CollectionQueryOptions {
    return {
      limitToCompleteCollections: false
    };
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

    let result = collectionSnapshot.data();
    if (!result) {
      result = await this.backfillService.backfillCollection(collection.chainId as ChainId, collection.address);
    }
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
    const res = await this.statsService.getCollectionStats(collection, {
      period: StatsPeriod.Hourly,
      date: Date.now()
    });
    if (typeof res?.floorPrice === 'number') {
      return res.floorPrice;
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

  async getCurated(collectionQuery: CuratedCollectionsQuery, user: undefined): Promise<UserCuratedCollectionsDto>;
  async getCurated(collectionQuery: CuratedCollectionsQuery, user: ParsedUserId): Promise<UserCuratedCollectionsDto>;
  async getCurated(collectionsQuery: CuratedCollectionsQuery, user?: ParsedUserId) {
    const stakerContractChainId = collectionsQuery.chainId ?? ChainId.Mainnet;
    const stakerContractAddress = this.curationService.getStakerAddress(stakerContractChainId);
    let query = this.firebaseService.firestore
      .collectionGroup('curationSnippets')
      .where('metadata.stakerContractAddress', '==', stakerContractAddress)
      .where(
        'metadata.stakerContractChainId',
        '==',
        stakerContractChainId
      ) as FirebaseFirestore.Query<CurrentCurationSnippetDoc>;

    if (collectionsQuery.orderBy === CuratedCollectionsOrderBy.Timestamp) {
      const topCollection = await this.getTopCollection(stakerContractAddress, stakerContractChainId);
      const topVotes = topCollection?.stats.numCuratorVotes || 0;
      const percentage = 0.05;
      const minRequiredCuratorVotes = Math.round(topVotes * percentage);
      // There's a minor firestore limitation here: we need to orderBy on 'stats.numCuratorVotes' first (before ordering on timestamps) because we use .where() inequality filters (>, <) here.
      // This will result in an order sorted by 'numCuratorVotes' first, followed by 'timestamps' afterwards.
      // Preferably it would be the other way around but unfortunately that doesn't seem possible ¯\_(ツ)_/¯.
      query = query
        .where('stats.numCuratorVotes', '>', minRequiredCuratorVotes)
        .where('stats.numCuratorVotes', '<', topVotes)
        .orderBy('stats.numCuratorVotes', 'desc');
    }

    const orderByField = {
      [CuratedCollectionsOrderBy.Apr]: {
        primary: 'stats.feesAPR',
        secondary: 'metadata.collectionAddress'
      },
      [CuratedCollectionsOrderBy.Votes]: {
        primary: 'stats.numCuratorVotes',
        secondary: 'metadata.collectionAddress'
      },
      [CuratedCollectionsOrderBy.Timestamp]: {
        primary: 'currentBlock.metadata.timestamp',
        secondary: 'metadata.collectionAddress'
      }
    };

    const orderBy = orderByField[collectionsQuery.orderBy];
    query = query
      .orderBy(orderBy.primary, collectionsQuery.orderDirection)
      .orderBy(orderBy.secondary, collectionsQuery.orderDirection)
      .limit(collectionsQuery.limit + 1);

    type Cursor = Record<CuratedCollectionsOrderBy, { value: number; collectionAddress: string }>;
    const cursor = this.paginationService.decodeCursorToObject<Partial<Cursor>>(collectionsQuery.cursor);
    const startAt = cursor[collectionsQuery.orderBy];
    if (startAt && 'value' in startAt && 'collectionAddress' in startAt) {
      query = query.startAt(startAt.value, startAt.collectionAddress);
    }

    const querySnap = await query.get();
    const results: (CurrentCurationSnippetDoc & { curator?: CurationBlockUser })[] = [];

    querySnap.docs.forEach((doc, index) => {
      const data = doc.data() ?? {};
      results[index] = { ...data };
    });

    if (user) {
      const curationSnippetUserRefs = querySnap.docs.map((curationSnippetDoc) => {
        return curationSnippetDoc.ref
          .collection(firestoreConstants.CURATION_SNIPPET_USERS_COLL)
          .doc(user.userAddress) as FirebaseFirestore.DocumentReference<CurationBlockUser>;
      });

      if (curationSnippetUserRefs.length > 0) {
        const userSnaps = (await this.firebaseService.firestore.getAll(
          ...curationSnippetUserRefs
        )) as FirebaseFirestore.DocumentSnapshot<CurationBlockUser>[];
        userSnaps.forEach((userSnap, index) => {
          const blockUser = userSnap.data();
          results[index].curator = blockUser;
        });
      }
    }

    let hasNextPage = querySnap.size > collectionsQuery.limit;
    let updatedCursor = '';
    if (hasNextPage) {
      const startAtItem = results.pop();
      if (startAtItem) {
        const rawCursor: Cursor = {
          [CuratedCollectionsOrderBy.Apr]: {
            value: startAtItem.currentBlock?.stats.blockApr ?? 0,
            collectionAddress: startAtItem.metadata.collectionAddress
          },
          [CuratedCollectionsOrderBy.Votes]: {
            value: startAtItem.stats.numCuratorVotes ?? 0,
            collectionAddress: startAtItem.metadata.collectionAddress
          },
          [CuratedCollectionsOrderBy.Timestamp]: {
            value: startAtItem.currentBlock?.metadata.timestamp ?? 0,
            collectionAddress: startAtItem.metadata.collectionAddress
          }
        };
        updatedCursor = this.paginationService.encodeCursor(rawCursor);
      } else {
        hasNextPage = false;
      }
    }

    const curatedCollections = results.map((item) => {
      const curatedCollection: UserCuratedCollectionDto = {
        address: item.metadata.collectionAddress,
        chainId: item.metadata.collectionChainId,
        stakerContractAddress: item.metadata.stakerContractAddress,
        stakerContractChainId: item.metadata.stakerContractChainId,
        tokenContractAddress: item.metadata.tokenContractAddress,
        tokenContractChainId: item.metadata.tokenContractChainId,
        curator: {
          address: item.curator?.metadata?.userAddress ?? user?.userAddress ?? '',
          fees: item.curator?.stats?.totalProtocolFeesAccruedEth ?? 0,
          votes: item.curator?.stats?.votes ?? 0,
          feesAPR: item.curator?.stats?.blockApr ?? 0
        },
        fees: item.stats?.feesAccruedEth ?? 0,
        feesAPR: item.stats?.feesAPR ?? 0,
        timestamp: item.metadata.updatedAt,
        slug: item?.collection?.slug,
        numCuratorVotes: item.stats.numCuratorVotes,
        profileImage: item?.collection?.profileImage ?? '',
        bannerImage: item?.collection?.bannerImage ?? '',
        name: item?.collection?.name ?? '',
        hasBlueCheck: item?.collection?.hasBlueCheck ?? false
      };

      return curatedCollection;
    });

    return {
      data: curatedCollections,
      hasNextPage,
      cursor: updatedCursor
    };
  }
}
