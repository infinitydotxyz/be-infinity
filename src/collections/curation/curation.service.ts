import { StakeDuration } from '@infinityxyz/lib/types/core';
import { CuratedCollectionDto } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections.dto';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { TokenContractService } from 'ethereum/contracts/token.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ParsedBulkVotes } from './bulk-votes.pipe';
import { CurationLedgerEvent, CurationVotesAdded } from '@infinityxyz/lib/types/core/curation-ledger';

@Injectable()
export class CurationService {
  constructor(
    private firebaseService: FirebaseService,
    private stakerContractService: StakerContractService,
    private tokenContractService: TokenContractService
  ) {}

  /**
   * Vote on a specific NFT collection.
   *
   * User votes are stored in the `collections` collection
   * and the total amount of votes is stored in the `users` collection for quick reads.
   */
  async vote({
    parsedCollectionId,
    user: parsedUser,
    votes
  }: {
    parsedCollectionId: ParsedCollectionId;
    user: ParsedUserId;
    votes: number;
  }) {
    const collectionSnap = await parsedCollectionId.ref.get();
    const collection = collectionSnap.data() ?? {};
    const res = await this.firebaseService.firestore.runTransaction(async (txn) => {
      const curatorDocRef = parsedCollectionId.ref
        .collection(firestoreConstants.COLLECTION_CURATORS_COLL)
        .doc(parsedUser.ref.id) as FirebaseFirestore.DocumentReference<CuratedCollectionDto>;

      const [userSnap, curatedCollectionSnap] = (await txn.getAll<UserProfileDto | CuratedCollectionDto>(
        parsedUser.ref,
        curatorDocRef
      )) as [
        FirebaseFirestore.DocumentSnapshot<UserProfileDto>,
        FirebaseFirestore.DocumentSnapshot<CuratedCollectionDto>
      ];

      const user: Partial<UserProfileDto> = userSnap.data() ?? {};
      const curatedCollection: Partial<CuratedCollectionDto> = curatedCollectionSnap.data() ?? {};

      const stakePower = user.stake?.stakePower ?? 0;
      const totalVotes = user.totalCuratedVotes ?? 0;
      const availableVotes = stakePower - totalVotes;
      const curatedCollectionVotes = curatedCollection.numCuratorVotes ?? 0;

      if (votes > availableVotes) {
        return {
          success: false,
          message: `Insufficient amount of votes available. You have ${availableVotes} votes available, but attempted to use ${votes} votes.`
        };
      }

      const curatedCollectionUpdate: CuratedCollectionDto = {
        votes: curatedCollectionVotes + votes,
        userAddress: parsedUser.userAddress,
        userChainId: parsedUser.userChainId,
        timestamp: Date.now(),
        address: collection?.address || parsedCollectionId.address,
        chainId: collection?.chainId || parsedCollectionId.chainId,
        name: collection?.metadata?.name ?? '',
        profileImage: collection?.metadata?.profileImage ?? '',
        slug: collection?.slug ?? '',
        // TODO: APRs
        fees: 0,
        feesAPR: 0,
        numCuratorVotes: 0 // TODO find a better way to update this. this value should also be store in the collection document
      };

      const totalCurated = user?.totalCurated ?? 0;
      const updatedTotalCurated = curatedCollectionVotes === 0 ? 1 + totalCurated : totalCurated;
      const userUpdate: Partial<UserProfileDto> = {
        totalCurated: updatedTotalCurated,
        totalCuratedVotes: totalVotes + votes
      };

      const voteEvent: CurationVotesAdded = {
        votes,
        userAddress: parsedUser.userAddress,
        discriminator: CurationLedgerEvent.VotesAdded,
        blockNumber: 0,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        isAggregated: false,
        isDeleted: false,
        address: parsedCollectionId.address,
        chainId: parsedCollectionId.chainId
      };
      const voteEventRef = this.firebaseService.firestore.collection(firestoreConstants.CURATION_LEDGER_COLL).doc();

      txn.set(parsedUser.ref, userUpdate, { merge: true });
      txn.set(curatorDocRef, curatedCollectionUpdate, { merge: true });
      txn.create(voteEventRef, voteEvent);
      return {
        success: true
      };
    });
    return res;
  }

  /**
   * Vote on multiple collections in bulk.
   * @param votes parsed bulk votes
   * @param user parsed user
   * @returns
   */
  async voteBulk(votes: ParsedBulkVotes[], user: ParsedUserId) {
    // votes should be executed in series to prevent too many transaction locks on the user document
    for (const vote of votes) {
      const result = await this.vote({ parsedCollectionId: vote.parsedCollectionId, user, votes: vote.votes });
      if (!result.success) {
        return result;
      }
    }
    return {
      success: true
    };
  }

  /**
   * Returns the total number of available votes.
   * Based on the balance read from the contract and database records.
   */
  async getAvailableVotes(user: ParsedUserId): Promise<number> {
    // available votes according to record in database
    const { totalCuratedVotes: dbVotes, stake } = await this.getUserCurationInfo(user);
    const contractVotes = stake?.stakePower;

    // actual available votes
    const availableVotes = contractVotes - dbVotes;

    return availableVotes > 0 ? availableVotes : 0;
  }

  async getTotalStaked(user: ParsedUserId) {
    return this.stakerContractService.getTotalStaked(user);
  }

  async getTokenBalance(user: ParsedUserId) {
    return this.tokenContractService.getTokenBalance(user);
  }

  /**
   * Find a specific user-curated collection.
   */
  async findUserCurated(
    user: Omit<ParsedUserId, 'ref'>,
    collection: Omit<ParsedCollectionId, 'ref'>
  ): Promise<CuratedCollectionDto | null> {
    const snap = await this.firebaseService.firestore
      .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
      .where('userAddress', '==', user.userAddress)
      .where('userChainId', '==', user.userChainId)
      .where('address', '==', collection.address)
      .where('chainId', '==', collection.chainId)
      .limit(1)
      .get();

    const doc = snap.docs[0];

    if (!doc?.exists) {
      return null;
    }

    return doc.data() as CuratedCollectionDto;
  }

  /**
   * Returns information about a specific user's curated collections
   * such as the total amount of curated collections, total votes (on all collections).
   * @param user
   * @returns
   */
  async getUserCurationInfo(
    parsedUser: ParsedUserId
  ): Promise<Pick<UserProfileDto, 'totalCurated' | 'totalCuratedVotes' | 'stake'>> {
    const snap = await parsedUser.ref.get();
    const user = (snap.data() ?? {}) as Partial<UserProfileDto>;
    const totalCurated = user?.totalCurated ?? 0;
    const totalCuratedVotes = user?.totalCuratedVotes ?? 0;
    const stake = user?.stake ?? {
      stakeInfo: {
        [StakeDuration.X0]: {
          amount: '0',
          timestamp: NaN
        },
        [StakeDuration.X3]: {
          amount: '0',
          timestamp: NaN
        },
        [StakeDuration.X6]: {
          amount: '0',
          timestamp: NaN
        },
        [StakeDuration.X12]: {
          amount: '0',
          timestamp: NaN
        }
      },
      stakePower: 0,
      blockUpdatedAt: 0
    };

    return {
      totalCurated,
      totalCuratedVotes,
      stake
    };
  }
}
