import { BaseCollection, ChainId, OrderDirection } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import firebaseAdmin from 'firebase-admin';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import {
  CollectionFavoriteDto,
  FavoriteCollectionsQueryDto,
  TokenomicsConfigDto,
  UserFavoriteDto
} from '@infinityxyz/lib/types/dto';
import { CursorService } from 'pagination/cursor.service';
import { firestoreConstants } from '@infinityxyz/lib/utils';

@Injectable()
export class FavoritesService {
  constructor(
    private firebaseService: FirebaseService,
    private stakerContractService: StakerContractService,
    private cursorService: CursorService
  ) {}

  private async getRootRef(chainId = ChainId.Mainnet) {
    const stakerContract = this.stakerContractService.getStakerAddress(chainId);
    const phaseId = await this.getCurrentPhaseId();
    return this.firebaseService.firestore
      .collection('favorites')
      .doc(`${chainId}:${stakerContract}`)
      .collection('favoritesByPhase')
      .doc(phaseId);
  }

  private async getCurrentPhaseId(chainId = ChainId.Mainnet) {
    const ref = this.firebaseService.firestore
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(chainId) as FirebaseFirestore.DocumentReference<TokenomicsConfigDto>;
    const docRef = await ref.get();
    const doc = docRef.data();
    const activePhase = doc?.phases.find((phase) => phase.isActive);
    if (!activePhase) {
      throw new Error('Current active phase not found');
    }
    return activePhase.id;
  }

  private fromCollection(collection: BaseCollection): Omit<CollectionFavoriteDto, 'numFavorites' | 'timestamp'> {
    return {
      bannerImage: collection.metadata.bannerImage,
      collectionAddress: collection.address,
      collectionChainId: collection.chainId,
      hasBlueCheck: collection.hasBlueCheck,
      name: collection.metadata.name,
      profileImage: collection.metadata.profileImage,
      slug: collection.slug
    };
  }

  /**
   * Submit a favorite collection for a specific user during this phase.
   * This method may overwrite previous saves.
   *
   * @param collection The collection to vote for.
   * @param user The user who is submitting the vote.
   */
  async saveFavorite(collection: ParsedCollectionId, user: ParsedUserId) {
    const rootRef = await this.getRootRef(user.userChainId);
    const usersRef = rootRef.collection(firestoreConstants.USER_PHASE_FAVORITES).doc(user.userAddress);
    const collectionsRef = rootRef
      .collection(firestoreConstants.COLLECTION_PHASE_FAVORITES)
      .doc(`${collection.chainId}:${collection.address}`);

    const favoritedCollection = (await collection.ref.get()).data() as BaseCollection;

    await this.firebaseService.firestore.runTransaction(async (txn) => {
      const timestamp = Date.now();

      // Get the current favorited collection.
      const previousFavoritedCollectionSnap = await txn.get(
        rootRef.collection(firestoreConstants.USER_PHASE_FAVORITES).doc(user.userAddress)
      );

      // If we already voted on another collection, decrement the votes on it.
      if (previousFavoritedCollectionSnap.exists) {
        const previousFavoritedCollection = previousFavoritedCollectionSnap.data() as UserFavoriteDto;
        const ref = rootRef
          .collection(firestoreConstants.COLLECTION_PHASE_FAVORITES)
          .doc(`${previousFavoritedCollection.collectionChainId}:${previousFavoritedCollection.collectionAddress}`);

        txn.set(
          ref,
          {
            numFavorites: firebaseAdmin.firestore.FieldValue.increment(-1) as any,
            timestamp
          } as CollectionFavoriteDto,
          { merge: true }
        );
      }

      // Update user favorited collection
      txn.set(
        usersRef,
        {
          collectionChainId: collection.chainId,
          collectionAddress: collection.address,
          userAddress: user.userAddress,
          userChainId: user.userChainId,
          timestamp
        } as UserFavoriteDto,
        { merge: false }
      );

      // Update collection favorites
      txn.set(
        collectionsRef,
        {
          ...this.fromCollection(favoritedCollection),
          numFavorites: firebaseAdmin.firestore.FieldValue.increment(1) as any,
          timestamp
        } as CollectionFavoriteDto,
        { merge: true }
      );
    });
  }

  /**
   * Returns the current user-favorited collection.
   */
  async getFavoriteCollection(user: ParsedUserId): Promise<null | UserFavoriteDto> {
    const rootRef = await this.getRootRef(user.userChainId);
    const docRef = rootRef.collection(firestoreConstants.COLLECTION_PHASE_FAVORITES).doc(user.userAddress);
    const snap = await docRef.get();
    return snap.exists ? (snap.data() as UserFavoriteDto) : null;
  }

  async getFavoriteCollections(query: FavoriteCollectionsQueryDto) {
    const rootRef = await this.getRootRef();
    type Cursor = { collection: string };
    const queryCursor = this.cursorService.decodeCursorToObject<Cursor>(query.cursor);
    const limit = query.limit + 1;

    let leaderboardQuery = rootRef
      .collection(firestoreConstants.COLLECTION_PHASE_FAVORITES)
      .orderBy('numFavorites', query.orderDirection ?? OrderDirection.Descending)
      .where('numFavorites', '>', 0)
      .limit(limit);

    if (queryCursor.collection) {
      leaderboardQuery = leaderboardQuery.startAt(queryCursor.collection);
    }

    const leaderboardSnapshot = await leaderboardQuery.get();

    const leaderboard = leaderboardSnapshot.docs.map((doc) => doc.data()) as CollectionFavoriteDto[];
    const hasNextPage = leaderboard.length > query.limit;
    const last = leaderboard[leaderboard.length - 1];
    const updatedCursorObj: Cursor = {
      collection: last ? `${last.collectionChainId}:${last.collectionAddress}` : queryCursor.collection
    };

    const leaderboardResults = leaderboard.slice(0, query.limit);

    return {
      hasNextPage,
      data: leaderboardResults,
      cursor: this.cursorService.encodeCursor(updatedCursorObj)
    };
  }
}
