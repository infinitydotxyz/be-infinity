import {
  ChainId,
  CurationBlockUser,
  OrderDirection,
  UserDisplayData,
  UserFeedEvent
} from '@infinityxyz/lib/types/core';
import { UserCuratedCollectionDto, UserCuratedCollectionsDto } from '@infinityxyz/lib/types/dto/collections';
import {
  CuratedCollectionsOrderBy,
  CuratedCollectionsQuery
} from '@infinityxyz/lib/types/dto/collections/curation/curated-collections-query.dto';
import { NftArrayDto, NftDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import {
  UserActivityArrayDto,
  UserActivityQueryDto,
  UserCollection,
  UserCollectionsQuery,
  UserCollectionsResponse,
  UserFollowingCollection,
  UserFollowingCollectionDeletePayload,
  UserFollowingCollectionPostPayload,
  UserFollowingUser,
  UserFollowingUserDeletePayload,
  UserFollowingUserPostPayload,
  UserNftsQueryDto,
  UserProfileDto
} from '@infinityxyz/lib/types/dto/user';
import { firestoreConstants, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { AlchemyService } from 'alchemy/alchemy.service';
import { CurationService } from 'collections/curation/curation.service';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidUserError } from 'common/errors/invalid-user.error';
import { BigNumber } from 'ethers/lib/ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { NftsService } from '../collections/nfts/nfts.service';
import { AlchemyNftToInfinityNft } from '../common/transformers/alchemy-nft-to-infinity-nft.pipe';
import { ParsedUserId } from './parser/parsed-user-id';

@Injectable()
export class UserService {
  private alchemyNftToInfinityNft: AlchemyNftToInfinityNft;
  constructor(
    private firebaseService: FirebaseService,
    private alchemyService: AlchemyService,
    private paginationService: CursorService,
    private nftsService: NftsService,
    private curationService: CurationService
  ) {
    this.alchemyNftToInfinityNft = new AlchemyNftToInfinityNft(this.nftsService);
  }

  async getProfile(user: ParsedUserId) {
    const profileSnapshot = await user.ref.get();
    const profile = profileSnapshot.data();

    if (!profile) {
      return null;
    }

    if (!profile.address) {
      profile.address = user.userAddress;
    }

    return profile;
  }

  async getProfileForUserAddress(user: string) {
    const profileSnapshot = await this.firebaseService.firestore
      .collection(firestoreConstants.USERS_COLL)
      .where('username', '==', trimLowerCase(user))
      .limit(1)
      .get();

    const doc = profileSnapshot.docs[0];

    const profile = doc?.data() as UserProfileDto;

    if (!profile) {
      return null;
    }

    return profile;
  }

  async getUserProfilesDisplayData(users: string[] | ParsedUserId[]): Promise<UserDisplayData[]> {
    const userRefs = users.map((item) => {
      if (typeof item === 'string') {
        return this.firebaseService.firestore
          .collection(firestoreConstants.USERS_COLL)
          .doc(item) as FirebaseFirestore.DocumentReference<UserProfileDto>;
      }
      return item.ref;
    });
    const userProfilesSnapshots = await this.firebaseService.firestore.getAll(...userRefs);

    const userProfiles = userProfilesSnapshots.map((snap) => {
      const data = snap.data();
      if (!data) {
        return {
          address: snap.ref.id,
          displayName: '',
          username: '',
          profileImage: '',
          bannerImage: ''
        } as UserDisplayData;
      }
      return {
        address: data.address || snap.ref.id,
        displayName: data.displayName || '',
        username: data.username || '',
        profileImage: data.profileImage || '',
        bannerImage: data.bannerImage || ''
      } as UserDisplayData;
    });

    return userProfiles;
  }

  async getCollectionsBeingFollowed(user: ParsedUserId) {
    const collectionFollows = user.ref.collection(firestoreConstants.COLLECTION_FOLLOWS_COLL);

    const snap = await collectionFollows.get();
    const followingCollections: UserFollowingCollection[] = snap.docs.map((doc) => {
      const docData = doc.data() as UserFollowingCollection;
      return docData;
    });
    return followingCollections;
  }

  async followCollection(user: ParsedUserId, payload: UserFollowingCollectionPostPayload) {
    const collectionRef = await this.firebaseService.getCollectionRef({
      chainId: payload.collectionChainId,
      address: payload.collectionAddress
    });

    const collection = (await collectionRef.get()).data();
    if (!collection) {
      throw new InvalidCollectionError(payload.collectionAddress, payload.collectionChainId, 'Collection not found');
    }
    if (!collection?.state?.create?.step) {
      throw new InvalidCollectionError(
        payload.collectionAddress,
        payload.collectionChainId,
        'Collection is not fully indexed'
      );
    }

    await user.ref
      .collection(firestoreConstants.COLLECTION_FOLLOWS_COLL)
      .doc(payload.collectionChainId + ':' + payload.collectionAddress)
      .set({
        collectionAddress: payload.collectionAddress,
        collectionChainId: payload.collectionChainId,
        name: collection?.metadata?.name,
        slug: collection.slug,
        userAddress: user.userAddress
      });
    return {};
  }

  async unfollowCollection(user: ParsedUserId, payload: UserFollowingCollectionDeletePayload) {
    const collectionRef = await this.firebaseService.getCollectionRef({
      chainId: payload.collectionChainId,
      address: payload.collectionAddress
    });

    const collection = (await collectionRef.get()).data();
    if (!collection) {
      throw new InvalidCollectionError(payload.collectionAddress, payload.collectionChainId, 'Collection not found');
    }
    if (!collection?.state?.create?.step) {
      throw new InvalidCollectionError(
        payload.collectionAddress,
        payload.collectionChainId,
        'Collection is not fully indexed'
      );
    }

    await user.ref
      .collection(firestoreConstants.COLLECTION_FOLLOWS_COLL)
      .doc(payload.collectionChainId + ':' + payload.collectionAddress)
      .delete();
    return {};
  }

  async getUsersBeingFollowed(user: ParsedUserId) {
    const userFollows = user.ref.collection(firestoreConstants.USER_FOLLOWS_COLL);

    const snap = await userFollows.get();
    const followingUsers: UserFollowingUser[] = snap.docs.map((doc) => {
      const docData = doc.data() as UserFollowingUser;
      return docData;
    });
    return followingUsers;
  }

  async followUser(user: ParsedUserId, payload: UserFollowingUserPostPayload) {
    const userRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(payload.userAddress);

    const followingUser = (await userRef.get()).data();
    if (!followingUser) {
      throw new InvalidUserError(payload.userAddress, 'User not found');
    }

    await user.ref.collection(firestoreConstants.USER_FOLLOWS_COLL).doc(payload.userAddress).set({
      userAddress: payload.userAddress
    });
    return {};
  }

  async unfollowUser(user: ParsedUserId, payload: UserFollowingUserDeletePayload) {
    const followingUser = (await user.ref.get()).data();
    if (!followingUser) {
      throw new InvalidUserError(payload.userAddress, 'User not found');
    }

    await user.ref.collection(firestoreConstants.USER_FOLLOWS_COLL).doc(payload.userAddress).delete();
    return {};
  }

  async getCollections(user: ParsedUserId, query: UserCollectionsQuery): Promise<UserCollectionsResponse> {
    const chainId = query.chainId || ChainId.Mainnet;
    const data = await this.alchemyService.getUserCollections(user.userAddress, chainId, query);
    const collections = (data?.contracts ?? []).map((item) => {
      const collection: UserCollection = {
        address: item.address,
        numNFTs: item.numDistinctTokensOwned,
        name: item.opensea.collectionName ?? item.name,
        symbol: item.symbol,
        imageUrl: item.opensea.imageUrl,
        floorPrice: item.opensea.floorPrice
      };
      return collection;
    });

    const cursor = data?.pageKey ?? '';
    return {
      data: collections,
      cursor,
      hasNextPage: !!cursor
    };
  }

  async getNfts(
    user: ParsedUserId,
    query: Pick<UserNftsQueryDto, 'collections' | 'cursor' | 'limit' | 'chainId'>
  ): Promise<NftArrayDto> {
    const chainId = query.chainId || ChainId.Mainnet;
    type Cursor = { pageKey?: string; startAtToken?: string };
    const cursor = this.paginationService.decodeCursorToObject<Cursor>(query.cursor);
    let totalOwned = NaN;

    const _fetchNfts = async (
      pageKey: string,
      startAtToken?: string
    ): Promise<{ pageKey: string; nfts: NftDto[]; hasNextPage: boolean }> => {
      const response = await this.alchemyService.getUserNfts(
        user.userAddress,
        chainId,
        pageKey,
        query.collections ?? [],
        { limit: 50, orderBy: 'transferTime' }
      );
      totalOwned = response?.totalCount ?? NaN;
      const nextPageKey = response?.pageKey ?? '';
      let nfts = response?.ownedNfts ?? [];

      if (startAtToken) {
        const indexToStartAt = nfts.findIndex(
          (item) => BigNumber.from(item.id.tokenId).toString() === cursor.startAtToken
        );
        nfts = nfts.slice(indexToStartAt);
      }

      const nftsToTransform = nfts.map((item) => ({ alchemyNft: item, chainId }));
      const results = await this.alchemyNftToInfinityNft.transform(nftsToTransform);
      const validNfts = results.filter((item) => !!item) as unknown as NftDto[];
      const hasNextPage = !!nextPageKey && validNfts.length > 0;

      return { pageKey: nextPageKey, nfts: validNfts, hasNextPage };
    };

    const limit = query.limit + 1; // +1 to check if there is a next page
    let nfts: NftDto[] = [];
    let alchemyHasNextPage = true;
    let pageKey = '';
    let nextPageKey = cursor?.pageKey ?? '';
    let pageNumber = 0;
    while (nfts.length < limit && alchemyHasNextPage) {
      pageKey = nextPageKey;
      const startAtToken = pageNumber === 0 && cursor.startAtToken ? cursor.startAtToken : undefined;
      const response = await _fetchNfts(pageKey, startAtToken);
      nfts = [...nfts, ...response.nfts];
      alchemyHasNextPage = response.hasNextPage;
      nextPageKey = response.pageKey;
      pageNumber += 1;
    }

    const continueFromCurrentPage = nfts.length > query.limit;
    const hasNextPage = continueFromCurrentPage || alchemyHasNextPage;
    const nftsToReturn = nfts.slice(0, query.limit);
    const nftToStartAt = nfts?.[query.limit]?.tokenId;

    const updatedCursor = this.paginationService.encodeCursor({
      pageKey: continueFromCurrentPage ? pageKey : nextPageKey,
      startAtToken: nftToStartAt
    });

    return {
      data: nftsToReturn,
      cursor: updatedCursor,
      hasNextPage,
      totalOwned
    };
  }

  async getByUsername(username: string) {
    const snapshot = await this.firebaseService.firestore
      .collection(firestoreConstants.USERS_COLL)
      .where('username', '==', trimLowerCase(username))
      .limit(1)
      .get();

    const doc = snapshot.docs[0];

    if (!doc?.exists) {
      return { user: null, ref: null };
    }

    const user = doc?.data() as UserProfileDto;

    return { user, ref: doc.ref as FirebaseFirestore.DocumentReference<UserProfileDto> };
  }

  /**
   * Returns a document reference to the collection with the specified address.
   */
  getRef(address: string) {
    return this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(address);
  }

  async getActivity(user: ParsedUserId, query: UserActivityQueryDto): Promise<UserActivityArrayDto> {
    const events = query.events && query.events.length > 10 ? query.events.slice(0, 10) : query.events ?? []; // slice because firestore 'IN' query can only support 10 items

    let userEventsQuery = this.firebaseService.firestore
      .collection(firestoreConstants.FEED_COLL)
      .where('usersInvolved', 'array-contains', user.userAddress);

    // crashes if this is undefined or []
    if (events && events.length > 0) {
      userEventsQuery = userEventsQuery.where('type', 'in', events);
    }

    const cursor = this.paginationService.decodeCursorToNumber(query.cursor);
    const orderDirection = OrderDirection.Descending;

    userEventsQuery = userEventsQuery.orderBy('timestamp', orderDirection).limit(query.limit + 1);

    if (!Number.isNaN(cursor)) {
      userEventsQuery = userEventsQuery.startAfter(cursor);
    }
    const snapshot = await userEventsQuery.get();

    const data = snapshot.docs.map((item) => item.data() as UserFeedEvent);

    const hasNextPage = data.length > query.limit;
    if (hasNextPage) {
      data.pop();
    }
    const lastItem = data?.[data?.length - 1];
    const nextCursor = this.paginationService.encodeCursor(lastItem?.timestamp ?? '');

    return {
      data: data,
      hasNextPage,
      cursor: nextCursor
    };
  }

  /**
   * Fetch all user-curated collections.
   */
  async getAllCurated(user: ParsedUserId, query: CuratedCollectionsQuery): Promise<UserCuratedCollectionsDto> {
    const stakingContractChainId = user.userChainId;
    const stakingContractAddress = this.curationService.getStakerAddress(stakingContractChainId);
    const orderBy = {
      [CuratedCollectionsOrderBy.Votes]: 'stats.votes',
      [CuratedCollectionsOrderBy.Apr]: 'stats.blockApr',
      [CuratedCollectionsOrderBy.Timestamp]: 'metadata.updatedAt'
    };
    let q = this.firebaseService.firestore
      .collectionGroup(firestoreConstants.CURATION_SNIPPET_USERS_COLL)
      .where('metadata.userAddress', '==', user.userAddress)
      .where('metadata.stakerContractChainId', '==', stakingContractChainId)
      .where('metadata.stakerContractAddress', '==', stakingContractAddress)
      .orderBy(orderBy[query.orderBy], query.orderDirection)
      .orderBy('metadata.collectionAddress', 'desc') as FirebaseFirestore.Query<CurationBlockUser>;

    if (query.cursor) {
      const {
        stats: { votes },
        metadata: { collectionAddress }
      } = this.paginationService.decodeCursorToObject<CurationBlockUser>(query.cursor);
      if (typeof votes === 'number' && collectionAddress) {
        q = q.startAt(votes, collectionAddress);
      }
    }

    const snap = await q.limit(query.limit + 1).get();
    const curationBlockUsers = snap.docs.map((item) => item.data());

    let hasNextPage = curationBlockUsers.length > query.limit;
    let updatedCursor = '';
    if (hasNextPage) {
      const startAtItem = curationBlockUsers.pop();
      if (!startAtItem) {
        hasNextPage = false;
      }
      updatedCursor = this.paginationService.encodeCursor(startAtItem ?? {});
    }

    const curatedCollections = curationBlockUsers.map((curator) => {
      const curatedCollection: UserCuratedCollectionDto = {
        address: curator.metadata.collectionAddress,
        chainId: curator.metadata.collectionChainId,
        stakerContractAddress: curator.metadata.stakerContractAddress,
        stakerContractChainId: curator.metadata.stakerContractChainId,
        tokenContractAddress: curator.metadata.tokenContractAddress,
        tokenContractChainId: curator.metadata.tokenContractChainId,
        curator: {
          address: curator.metadata.userAddress,
          votes: curator.stats.votes,
          fees: curator.stats.totalProtocolFeesAccruedEth,
          feesAPR: curator.stats.blockApr
        },
        fees: curator.stats.totalProtocolFeesAccruedEth ?? 0,
        feesAPR: curator.stats.blockApr ?? 0,
        timestamp: curator.metadata.updatedAt,
        slug: curator.collection.slug,
        numCuratorVotes: curator.stats.numCuratorVotes,
        profileImage: curator.collection.profileImage,
        bannerImage: curator.collection.bannerImage,
        name: curator.collection.name,
        hasBlueCheck: curator.collection.hasBlueCheck
      };
      return curatedCollection;
    });

    return {
      data: curatedCollections,
      cursor: updatedCursor,
      hasNextPage
    };
  }
}
