import { ChainId, StakeAmount, StakeDuration } from '@infinityxyz/lib/types/core';
import { CuratedCollectionDto } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections.dto';
import { UserStakeDto } from '@infinityxyz/lib/types/dto/user';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { TokenContractService } from 'ethereum/contracts/token.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ParsedBulkVotes } from './bulk-votes.pipe';
import { CurationLedgerEvent, CurationVotesAdded } from '@infinityxyz/lib/types/core/curation-ledger';
import { CurationQuotaDto } from '@infinityxyz/lib/types/dto/collections/curation/curation-quota.dto';

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
      const stakingContractChainId = parsedUser.userChainId;
      const stakingContract = this.getStakerAddress(stakingContractChainId);
      const collectionStakingDocRef = parsedCollectionId.ref
        .collection(firestoreConstants.COLLECTION_CURATION_COLL)
        .doc(`${stakingContractChainId}:${stakingContract}`);
      const curatorDocRef = collectionStakingDocRef
        .collection(firestoreConstants.COLLECTION_CURATORS_COLL)
        .doc(parsedUser.ref.id) as FirebaseFirestore.DocumentReference<CuratedCollectionDto>;

      const userStakeRef = parsedUser.ref
        .collection(firestoreConstants.USER_CURATION_COLL)
        .doc(`${stakingContractChainId}:${stakingContract}`) as FirebaseFirestore.DocumentReference<UserStakeDto>;

      const [userStakeSnap, curatedCollectionSnap] = (await txn.getAll<UserStakeDto | CuratedCollectionDto>(
        userStakeRef,
        curatorDocRef
      )) as [
        FirebaseFirestore.DocumentSnapshot<UserStakeDto>,
        FirebaseFirestore.DocumentSnapshot<CuratedCollectionDto>
      ];
      const curatedCollection: Partial<CuratedCollectionDto> = curatedCollectionSnap.data() ?? {};
      const userStake: Partial<UserStakeDto> = userStakeSnap.data() ?? {};

      const stakePower = userStake.stakePower ?? 0;
      const totalCuratedVotes = userStake?.totalCuratedVotes ?? 0;
      const totalCurated = userStake?.totalCurated ?? 0;
      const availableVotes = stakePower - totalCuratedVotes;
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
        numCuratorVotes: 0, // TODO find a better way to update this. this value should also be store in the collection document
        stakerContractAddress: stakingContract,
        stakerContractChainId: stakingContractChainId
      };

      const updatedTotalCurated = curatedCollectionVotes === 0 ? 1 + totalCurated : totalCurated;
      const updatedTotalCuratedVotes = totalCuratedVotes + votes;
      const userStakeUpdate: Partial<UserStakeDto> = {
        stakerContractAddress: stakingContract,
        stakerContractChainId: stakingContractChainId,
        totalCurated: updatedTotalCurated,
        totalCuratedVotes: updatedTotalCuratedVotes
      };

      const voteEvent: CurationVotesAdded = {
        votes,
        collectionAddress: collection?.address || parsedCollectionId.address,
        stakerContractAddress: stakingContract,
        stakerContractChainId: stakingContractChainId,
        userAddress: parsedUser.userAddress,
        discriminator: CurationLedgerEvent.VotesAdded,
        blockNumber: 0,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        isAggregated: false,
        isDeleted: false,
        collectionChainId: parsedCollectionId.chainId
      };
      const voteEventRef = collectionStakingDocRef.collection(firestoreConstants.CURATION_LEDGER_COLL).doc();

      txn.set(userStakeRef, userStakeUpdate, { merge: true });
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
    const { totalCuratedVotes, stakePower } = await this.getUserCurationInfo(user);

    // actual available votes
    const availableVotes = stakePower - totalCuratedVotes;

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
    const stakingContractChainId = user.userChainId;
    const stakingContractAddress = this.getStakerAddress(stakingContractChainId);
    const snap = await this.firebaseService.firestore
      .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
      .where('userAddress', '==', user.userAddress)
      .where('userChainId', '==', user.userChainId)
      .where('address', '==', collection.address)
      .where('chainId', '==', collection.chainId)
      .where('stakerContractChainId', '==', stakingContractChainId)
      .where('stakerContractAddress', '==', stakingContractAddress)
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
  async getUserCurationInfo(parsedUser: ParsedUserId): Promise<UserStakeDto> {
    const stakerContractChainId = parsedUser.userChainId;
    const stakerContractAddress = this.getStakerAddress(stakerContractChainId);
    const userStakeRef = parsedUser.ref
      .collection(firestoreConstants.USER_CURATION_COLL)
      .doc(`${stakerContractChainId}:${stakerContractAddress}`) as FirebaseFirestore.DocumentReference<UserStakeDto>;
    const snap = await userStakeRef.get();

    return {
      stakerContractAddress: snap.get('stakerContractAddress') || stakerContractAddress,
      stakerContractChainId: snap.get('stakerContractChainId') || stakerContractChainId,
      stakeInfo: snap.get('stakeInfo') || {
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
      stakePower: snap.get('stakePower') ?? 0,
      blockUpdatedAt: snap.get('blockUpdatedAt') ?? NaN,
      totalCurated: snap.get('totalCurated') || 0,
      totalCuratedVotes: snap.get('totalCuratedVotes') || 0
    };
  }

  async getUserCurationQuota(user: ParsedUserId) {
    const tokenBalance = await this.getTokenBalance(user);
    const stake = await this.getUserCurationInfo(user);
    const totalStaked = Object.values(stake.stakeInfo).reduce(
      (acc, item: StakeAmount) => BigInt(acc) + BigInt(item.amount),
      0
    );

    const quota: CurationQuotaDto = {
      stake,
      tokenBalance,
      totalStaked: formatEth(totalStaked.toString(), 4),
      availableVotes: stake.stakePower - stake.totalCuratedVotes
    };

    return quota;
  }

  getStakerAddress(chainId: ChainId) {
    return this.stakerContractService.getStakerAddress(chainId);
  }
}
