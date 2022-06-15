/* eslint-disable no-empty */
import { ChainId } from '@infinityxyz/lib/types/core';
import { AlchemyNftToInfinityNft } from '../common/transformers/alchemy-nft-to-infinity-nft.pipe';
import { AlchemyService } from 'alchemy/alchemy.service';
import { CreationFlow, OrderDirection } from '@infinityxyz/lib/types/core';
import { NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core/feed';
import { firestoreConstants, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable, Optional } from '@nestjs/common';
import { ActivityType, activityTypeToEventType } from 'collections/nfts/nft-activity.types';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidUserError } from 'common/errors/invalid-user.error';
import { BigNumber } from 'ethers/lib/ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { StatsService } from 'stats/stats.service';
import { ParsedUserId } from './parser/parsed-user-id';
import { BadQueryError } from 'common/errors/bad-query.error';
import { RankingQueryDto } from '@infinityxyz/lib/types/dto/collections';
import { NftCollectionDto, NftDto, NftArrayDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import {
  UserFollowingCollection,
  UserFollowingCollectionPostPayload,
  UserFollowingCollectionDeletePayload,
  UserFollowingUser,
  UserFollowingUserPostPayload,
  UserFollowingUserDeletePayload,
  UserNftsQueryDto,
  UserNftsOrderType,
  UserProfileDto,
  UserActivityQueryDto,
  UserActivityArrayDto
} from '@infinityxyz/lib/types/dto/user';
import { NftsService } from '../collections/nfts/nfts.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';

export type UserActivity = NftSaleEvent | NftListingEvent | NftOfferEvent;

@Injectable()
export class UserService {
  private alchemyNftToInfinityNft: AlchemyNftToInfinityNft;
  private fsBatchHandler: FirestoreBatchHandler;
  constructor(
    private firebaseService: FirebaseService,
    private alchemyService: AlchemyService,
    private paginationService: CursorService,
    private nftsService: NftsService,
    @Optional() private statsService: StatsService
  ) {
    this.fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
    this.alchemyNftToInfinityNft = new AlchemyNftToInfinityNft(nftsService);
  }

  async getWatchlist(user: ParsedUserId, query: RankingQueryDto) {
    const collectionFollows = user.ref
      .collection(firestoreConstants.COLLECTION_FOLLOWS_COLL)
      .select('collectionAddress', 'collectionChainId');
    const snap = await collectionFollows.get();
    const collections = snap.docs
      .map((doc) => {
        const { collectionAddress, collectionChainId } = doc.data();
        return { chainId: collectionChainId, address: collectionAddress };
      })
      .filter((item) => {
        return item.chainId && item.address;
      });

    const statsPromises = collections.map((collection) =>
      this.statsService.getCollectionStats(collection, { period: query.period, date: query.date })
    );

    const stats = await Promise.all(statsPromises);

    const orderedStats = stats.sort((itemA, itemB) => {
      const statA = itemA[query.orderBy];
      const statB = itemB[query.orderBy];
      const isAsc = query.orderDirection === OrderDirection.Ascending;
      return isAsc ? statA - statB : statB - statA;
    });

    return orderedStats;
  }

  async getProfile(user: ParsedUserId) {
    const profileSnapshot = await user.ref.get();
    const profile = profileSnapshot.data();

    if (!profile) {
      return null;
    }

    return profile;
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
    if (collection?.state?.create?.step !== CreationFlow.Complete) {
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
    if (collection?.state?.create?.step !== CreationFlow.Complete) {
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

  async getUserNftCollections(user: ParsedUserId) {
    const collRef = user.ref.collection(firestoreConstants.USER_NFT_COLLECTION_COLL);

    const snap = await collRef.get();
    const nftCollections: NftCollectionDto[] = snap.docs.map((doc) => {
      const docData = doc.data() as NftCollectionDto;
      return docData;
    });
    return nftCollections;
  }

  async saveUserNftCollections(userAddress: string, nfts: NftDto[]): Promise<void> {
    const userRef = this.firebaseService.firestore
      .collection(firestoreConstants.USERS_COLL)
      .doc(userAddress)
      .collection(firestoreConstants.USER_NFT_COLLECTION_COLL);

    for (const nft of nfts) {
      const { chainId, collectionAddress, collectionName, collectionSlug, hasBlueCheck } = nft;
      if (chainId && collectionAddress && collectionName && collectionSlug) {
        const docRef = userRef.doc(`${chainId}:${collectionAddress}`);
        this.fsBatchHandler.add(
          docRef,
          {
            chainId,
            collectionAddress,
            collectionName,
            collectionSlug,
            hasBlueCheck
          },
          { merge: true }
        );
      }
    }
    await this.fsBatchHandler.flush().catch((err) => {
      console.error('error saving user nft collections', err);
    });
  }

  async getUserNftsWithOrders(user: ParsedUserId, nftsQuery: UserNftsQueryDto): Promise<NftArrayDto> {
    let query: FirebaseFirestore.Query<NftDto> = this.firebaseService.firestore.collectionGroup(
      firestoreConstants.COLLECTION_NFTS_COLL
    ) as any as FirebaseFirestore.Query<NftDto>;
    let orderSnippetItem = '';

    switch (nftsQuery.orderType) {
      case UserNftsOrderType.Listings:
        orderSnippetItem = 'ordersSnippet.listing.orderItem';
        query = query.where(`${orderSnippetItem}.makerAddress`, '==', user.userAddress);
        break;
      case UserNftsOrderType.OffersMade:
        orderSnippetItem = 'ordersSnippet.offer.orderItem';
        query = query.where(`${orderSnippetItem}.makerAddress`, '==', user.userAddress);
        break;
      case UserNftsOrderType.OffersReceived:
        orderSnippetItem = 'ordersSnippet.offer.orderItem';
        query = query.where(`${orderSnippetItem}.takerAddress`, '==', user.userAddress);
        break;
      default:
        throw new BadQueryError('orderType is invalid');
    }

    if (nftsQuery.collectionAddresses && nftsQuery.collectionAddresses.length > 0) {
      query = query.where(`${orderSnippetItem}.collectionAddress`, 'in', nftsQuery.collectionAddresses);
    }

    const minPrice = nftsQuery.minPrice ?? 0;
    const maxPrice = nftsQuery.maxPrice ?? Number.MAX_SAFE_INTEGER;
    query = query.where(`${orderSnippetItem}.startPriceEth`, '>=', minPrice);
    query = query.where(`${orderSnippetItem}.startPriceEth`, '<=', maxPrice);

    const orderDirection = nftsQuery.orderDirection ?? OrderDirection.Descending;
    query = query.orderBy(`${orderSnippetItem}.startPriceEth`, orderDirection);

    type Cursor = { startPriceEth?: number };
    const cursor = this.paginationService.decodeCursorToObject<Cursor>(nftsQuery.cursor);
    if (cursor.startPriceEth != null) {
      query = query.startAfter(cursor.startPriceEth);
    }

    const nftsSnapshot = await query.limit(nftsQuery.limit + 1).get();

    const nfts: NftDto[] = nftsSnapshot.docs.map((doc) => {
      return doc.data();
    });

    let hasNextPage = false;
    if (nfts.length > nftsQuery.limit) {
      hasNextPage = true;
      nfts.pop();
    }

    const lastItem = nfts[nfts.length - 1];
    const orderField = nftsQuery.orderType === UserNftsOrderType.Listings ? 'listing' : 'offer';
    const price = lastItem?.ordersSnippet?.[orderField]?.orderItem?.startPriceEth;
    const cursorObj: Cursor = { startPriceEth: price };
    const updatedCursor = this.paginationService.encodeCursor(cursorObj);

    return {
      cursor: updatedCursor,
      hasNextPage,
      data: nfts
    };
  }

  async getNfts(
    user: ParsedUserId,
    query: Pick<UserNftsQueryDto, 'collectionAddresses' | 'cursor' | 'limit' | 'chainId'>
  ): Promise<NftArrayDto> {
    const chainId = query.chainId ?? ChainId.Mainnet;
    type Cursor = { pageKey?: string; startAtToken?: string };
    const cursor = this.paginationService.decodeCursorToObject<Cursor>(query.cursor);
    const _fetchNfts = async (
      pageKey: string,
      startAtToken?: string
    ): Promise<{ pageKey: string; nfts: NftDto[]; hasNextPage: boolean }> => {
      // todo: directly fetch from firestore when data is ready
      const response = await this.alchemyService.getUserNfts(
        user.userAddress,
        chainId,
        pageKey,
        query.collectionAddresses
      );
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

      return { pageKey: nextPageKey, nfts: validNfts, hasNextPage: !!nextPageKey };
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
    // todo: remove this
    await this.saveUserNftCollections(user.userAddress, nfts);

    return {
      data: nftsToReturn,
      cursor: updatedCursor,
      hasNextPage
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
    const activityTypes = query.events && query?.events.length > 0 ? query.events : Object.values(ActivityType);

    const events = activityTypes.map((item) => activityTypeToEventType[item]);

    let userEventsQuery = this.firebaseService.firestore
      .collection(firestoreConstants.FEED_COLL)
      .where('type', 'in', events)
      .where('usersInvolved', 'array-contains', user.userAddress);

    const cursor = this.paginationService.decodeCursorToNumber(query.cursor);
    const orderDirection = OrderDirection.Descending;

    userEventsQuery = userEventsQuery.orderBy('timestamp', orderDirection).limit(query.limit + 1);

    if (!Number.isNaN(cursor)) {
      userEventsQuery = userEventsQuery.startAfter(cursor);
    }
    const snapshot = await userEventsQuery.get();

    const data = snapshot.docs.map((item) => item.data() as UserActivity);

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
}
