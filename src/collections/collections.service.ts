import {
  ChainId,
  Collection,
  CollectionMetadata,
  CreationFlow,
  CurationBlockUser,
  CurrentCurationSnippetDoc,
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
    private curationService: CurationService
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

  async searchByName(search: CollectionSearchQueryDto) {
    let firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      this.firebaseService.firestore.collection(firestoreConstants.COLLECTIONS_COLL);

    if (search.query) {
      const startsWith = getSearchFriendlyString(search.query);
      const endCode = getEndCode(startsWith);

      if (startsWith && endCode) {
        firestoreQuery = firestoreQuery.where('slug', '>=', startsWith).where('slug', '<', endCode);
      }
    }

    firestoreQuery = firestoreQuery.orderBy('slug');

    const cursor = this.paginationService.decodeCursor(search.cursor);
    if (cursor) {
      firestoreQuery = firestoreQuery.startAfter(cursor);
    }

    const snapshot = await firestoreQuery
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
      .limit(search.limit + 1) // +1 to check if there are more results
      .get();

    const collections = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        address: data.address as string,
        chainId: data.chainId as string,
        slug: data.slug as string,
        name: data.metadata.name as string,
        hasBlueCheck: data.hasBlueCheck as boolean,
        profileImage: data.metadata.profileImage as string,
        bannerImage: data.metadata.bannerImage as string,
        description: data.metadata.description as string
      };
    });

    const hasNextPage = collections.length > search.limit;
    if (hasNextPage) {
      collections.pop(); // Remove item used to check if there are more results
    }
    const updatedCursor = this.paginationService.encodeCursor(collections?.[collections?.length - 1]?.slug ?? ''); // Must be after we pop the item used for pagination

    return {
      data: collections,
      cursor: updatedCursor,
      hasNextPage
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
        primary: 'currentBlock.stats.blockApr',
        secondary: 'currentBlock.metadata.collectionAddress'
      },
      [CuratedCollectionsOrderBy.Votes]: {
        // primary: 'stats.numCuratorVotes',
        // secondary: 'metadata.collectionAddress'
        primary: 'mostRecentCompletedBlock.stats.numCuratorVotes',
        secondary: 'mostRecentCompletedBlock.metadata.collectionAddress'
      }
    };

    const orderBy = orderByField[collectionsQuery.orderBy];
    query = query
      .orderBy(orderBy.primary, collectionsQuery.orderDirection)
      .orderBy(orderBy.secondary, 'asc')
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
            value: startAtItem.mostRecentCompletedBlock?.stats.numCuratorVotes ?? Number.NaN,
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
        votes: item.curator?.stats?.votes ?? 0,
        fees: item.curator?.stats?.totalProtocolFeesAccruedEth ?? 0,
        feesAPR: item.curator?.stats?.blockApr ?? 0,
        timestamp: item.metadata.updatedAt,
        slug: item?.collection?.slug,
        // numCuratorVotes: item.stats.numCuratorVotes,
        numCuratorVotes:
          item?.currentBlock?.stats?.numCuratorVotes ?? item?.mostRecentCompletedBlock?.stats?.numCuratorVotes ?? 0,
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
