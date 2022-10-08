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
  CollectionSearchQueryDto,
  CuratedCollectionDto,
  CuratedCollectionsDto,
  TopOwnerDto,
  TopOwnersQueryDto
} from '@infinityxyz/lib/types/dto/collections';
import {
  CuratedCollectionsOrderBy,
  CuratedCollectionsQuery
} from '@infinityxyz/lib/types/dto/collections/curation/curated-collections-query.dto';
import { ExternalNftCollectionDto, NftCollectionDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId, getEndCode, getSearchFriendlyString } from '@infinityxyz/lib/utils';
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
    if (allStatsDoc.exists) {
      topOwners = allStatsDoc.data()?.topOwnersByOwnedNftsCount as TopOwner[];

      // make sure not undefined from above
      topOwners = topOwners ?? [];
    }

    // if data doesn't exist in firestore, fetch from zora
    if (!topOwners || topOwners.length === 0) {
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

  _searchBySlug(
    firestoreQuery: FirebaseFirestore.Query<Collection>,
    query: string,
    limit: number,
    startAfter: string,
    chainId: ChainId
  ) {
    if (query) {
      const startsWith = getSearchFriendlyString(query);
      const endCode = getEndCode(startsWith);

      if (startsWith && endCode) {
        firestoreQuery = firestoreQuery.where('slug', '>=', startsWith).where('slug', '<', endCode);
      }
    }

    firestoreQuery = firestoreQuery.where('chainId', '==', chainId).orderBy('slug');

    if (startAfter) {
      firestoreQuery = firestoreQuery.startAfter(startAfter);
    }

    firestoreQuery = firestoreQuery.limit(limit);
    return firestoreQuery;
  }

  async searchByName(search: CollectionSearchQueryDto) {
    type Keys = 'verified' | 'unverified';

    type Cursor = Record<Keys, { slug: string }>;

    const cursor: Cursor = this.paginationService.decodeCursorToObject<Cursor>(search.cursor);

    const collectionsRef = this.firebaseService.firestore.collection(
      firestoreConstants.COLLECTIONS_COLL
    ) as FirebaseFirestore.CollectionReference<Collection>;
    const verifiedCollectionsQuery = collectionsRef.where('hasBlueCheck', '==', true);
    const nonVerifiedCollectionsQuery = collectionsRef.where('hasBlueCheck', '==', false);

    const chainId = search.chainId ?? ChainId.Mainnet;

    const queries: { key: Keys; query: FirebaseFirestore.Query<Collection> }[] = [
      {
        key: 'verified',
        query: verifiedCollectionsQuery
      },
      {
        key: 'unverified',
        query: nonVerifiedCollectionsQuery
      }
    ];

    const results = await Promise.all(
      queries.map(async (item) => {
        const startAfter = cursor[item.key]?.slug ?? '';
        const query = this._searchBySlug(item.query, search.query ?? '', search.limit + 1, startAfter, chainId);

        const snapshot = await query
          .select(
            'address',
            'chainId',
            'slug',
            'metadata.name',
            'metadata.profileImage',
            'metadata.description',
            'metadata.bannerImage',
            'hasBlueCheck'
          )
          .get();

        const data = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          let hasNextPage = false;
          if (index + 1 > snapshot.docs.length) {
            hasNextPage = true;
          } else if (index + 1 === snapshot.docs.length) {
            hasNextPage = snapshot.docs.length === search.limit + 1;
          }

          return {
            hasNextPage,
            key: item.key,
            data: {
              address: data.address,
              chainId: data.chainId,
              slug: data.slug,
              name: data.metadata.name,
              hasBlueCheck: data.hasBlueCheck,
              profileImage: data.metadata.profileImage,
              bannerImage: data.metadata.bannerImage,
              description: data.metadata.description
            }
          };
        });

        return {
          key: item.key,
          data
        };
      })
    );

    let returnData = results.flatMap((item) => {
      return item.data;
    });

    const hasNextPage = returnData.length > search.limit;
    returnData = returnData.slice(0, search.limit);

    for (const item of returnData) {
      cursor[item.key] = item.data.slug;
    }

    return {
      data: returnData.map((item) => item.data),
      cursor: this.paginationService.encodeCursor(cursor),
      hasNextPage: hasNextPage
    };
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

  async getCurated(collectionsQuery: CuratedCollectionsQuery, user?: ParsedUserId): Promise<CuratedCollectionsDto> {
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

    const orderByField = {
      [CuratedCollectionsOrderBy.Apr]: {
        primary: 'stats.feesAPR',
        secondary: 'metadata.collectionAddress'
      },
      [CuratedCollectionsOrderBy.Votes]: {
        primary: 'stats.numCuratorVotes',
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
    if (typeof startAt?.value === 'number' && startAt.collectionAddress) {
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
            value: startAtItem.currentBlock?.stats.blockApr ?? Number.NaN,
            collectionAddress: startAtItem.metadata.collectionAddress
          },
          [CuratedCollectionsOrderBy.Votes]: {
            value: startAtItem.stats.numCuratorVotes,
            collectionAddress: startAtItem.metadata.collectionAddress
          }
        };
        updatedCursor = this.paginationService.encodeCursor(rawCursor);
      } else {
        hasNextPage = false;
      }
    }

    const curatedCollections = results.map((item) => {
      const curatedCollection: CuratedCollectionDto = {
        address: item.metadata.collectionAddress,
        chainId: item.metadata.collectionChainId,
        stakerContractAddress: item.metadata.stakerContractAddress,
        stakerContractChainId: item.metadata.stakerContractChainId,
        tokenContractAddress: item.metadata.tokenContractAddress,
        tokenContractChainId: item.metadata.tokenContractChainId,
        userAddress: item.curator?.metadata?.userAddress ?? '',
        userChainId: item.metadata.collectionChainId,
        fees: item.stats?.feesAccruedEth ?? 0,
        feesAPR: item.stats?.feesAPR ?? 0,
        votes: item.curator?.stats?.votes ?? 0,
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
