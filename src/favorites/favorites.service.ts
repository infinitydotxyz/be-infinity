import { BaseCollection, ChainId, OrderDirection } from '@infinityxyz/lib/types/core';
import { ConflictException, Injectable } from '@nestjs/common';
import firebaseAdmin from 'firebase-admin';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import {
  CollectionFavoriteDto,
  FavoriteCollectionPhaseDto,
  FavoriteCollectionsQueryDto,
  UserFavoriteDto
} from '@infinityxyz/lib/types/dto';
import { CursorService } from 'pagination/cursor.service';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { RewardsService } from 'rewards/rewards.service';

@Injectable()
export class FavoritesService {
  constructor(
    private firebaseService: FirebaseService,
    private stakerContractService: StakerContractService,
    private cursorService: CursorService,
    private rewardsService: RewardsService
  ) {}

  private getRootRef(chainId = ChainId.Mainnet, phaseId: string) {
    const stakerContract = this.stakerContractService.getStakerAddress(chainId);

    return this.firebaseService.firestore
      .collection('favorites')
      .doc(`${chainId}:${stakerContract}`)
      .collection('favoritesByPhase')
      .doc(phaseId);
  }

  private fromCollection(
    collection: BaseCollection
  ): Omit<CollectionFavoriteDto, 'numFavorites' | 'timestamp' | 'phaseId'> {
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
    const phase = await this.rewardsService.getActivePhase(user.userChainId);
    const rootRef = this.getRootRef(user.userChainId, phase.id);
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

      // If we already voted on another collection, throw because users can't change their votes until the phase has ended to prevent abuse.
      if (previousFavoritedCollectionSnap.exists) {
        throw new ConflictException('Already favorited another collection during this phase');
      }

      const collectionData: Partial<CollectionFavoriteDto> = {
        ...this.fromCollection(favoritedCollection),
        phaseId: phase.id,
        timestamp
      };

      // Update user favorited collection
      txn.set(
        usersRef,
        {
          ...collectionData,
          collectionChainId: collection.chainId,
          collectionAddress: collection.address,
          userAddress: user.userAddress,
          userChainId: user.userChainId
        } as UserFavoriteDto,
        { merge: false }
      );

      // Update collection favorites
      txn.set(
        collectionsRef,
        {
          ...collectionData,
          numFavorites: firebaseAdmin.firestore.FieldValue.increment(1) as any
        } as CollectionFavoriteDto,
        { merge: true }
      );
    });
  }

  /**
   * Returns a user-favorited collection.
   */
  async getFavoriteCollection(user: ParsedUserId, phaseId?: string): Promise<UserFavoriteDto | null> {
    if (!phaseId) {
      const phase = await this.rewardsService.getActivePhase(user.userChainId);
      phaseId = phase.id;
    }
    const rootRef = this.getRootRef(user.userChainId, phaseId);
    const docRef = rootRef.collection(firestoreConstants.USER_PHASE_FAVORITES).doc(user.userAddress);
    const snap = await docRef.get();
    return snap.exists ? (snap.data() as UserFavoriteDto) : null;
  }

  async getFavoriteCollectionsLeaderboard(query: FavoriteCollectionsQueryDto, phaseId: string) {
    const chainId = query.chainId || ChainId.Mainnet;
    const phase = await this.rewardsService.getPhase(chainId, phaseId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rootRef = this.getRootRef(chainId, phase!.id);

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

  async getPhases(chainId: ChainId = ChainId.Mainnet) {
    const tokenomicsConfig = await this.rewardsService.getConfig(chainId);

    if (!tokenomicsConfig?.phases) {
      return [];
    }

    let includePhase = true; // scoped var to keep track of the phases to include in the filter below

    return tokenomicsConfig.phases
      .map((phase) => {
        const mapped: FavoriteCollectionPhaseDto = {
          id: phase.id,
          isActive: phase.isActive,
          name: phase.name,
          progress: phase.progress,
          collectionPotFeesGenerated: phase.collectionPotFeesGenerated
        };
        return mapped;
      })
      .filter((phase) => {
        if (phase.isActive && includePhase) {
          includePhase = false;
          return true;
        }

        return includePhase;
      })
      .sort((x) => (x.isActive ? -1 : 0));
  }
}
