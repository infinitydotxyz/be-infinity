import { ChainId, Collection, StakeDuration, StakerContractPeriodUserDoc } from '@infinityxyz/lib/types/core';
import { UserStakeDto } from '@infinityxyz/lib/types/dto/user';
import {
  calculateStatsBigInt,
  firestoreConstants,
  formatEth,
  getTokenAddressByStakerAddress,
  getTotalStaked
} from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { TokenContractService } from 'ethereum/contracts/token.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ParsedBulkVotes } from './bulk-votes.pipe';
import {
  CurationBlockUser,
  CurationLedgerEvent,
  CurationVotesAdded,
  CurrentCurationSnippetDoc
} from '@infinityxyz/lib/types/core/curation-ledger';
import { CurationQuotaDto } from '@infinityxyz/lib/types/dto/collections/curation/curation-quota.dto';
import { EthereumService } from 'ethereum/ethereum.service';
import { partitionArray } from 'utils';
import { streamQuery } from 'firebase/stream-query';
import { UserCuratedCollectionDto } from '@infinityxyz/lib/types/dto';

@Injectable()
export class CurationService {
  private static BULK_VOTE_CHUNK_LIMIT = 100;
  constructor(
    private firebaseService: FirebaseService,
    private stakerContractService: StakerContractService,
    private tokenContractService: TokenContractService,
    private ethereumService: EthereumService
  ) {}

  /**
   * Vote on a specific NFT collection.
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
    return await this.voteBulk([{ votes, parsedCollectionId }], parsedUser);
  }

  /**
   * Vote on multiple collections in bulk.
   * @param votes parsed bulk votes
   * @param user parsed user
   * @returns
   */
  async voteBulk(votes: ParsedBulkVotes[], user: ParsedUserId) {
    const collectionVotes = new Map<string, ParsedBulkVotes>();
    for (const item of votes) {
      const id = `${item.parsedCollectionId.chainId}:${item.parsedCollectionId.address}`;
      const collection = collectionVotes.get(id) ?? { parsedCollectionId: item.parsedCollectionId, votes: 0 };
      collection.votes += item.votes;
      if (user.userChainId !== item.parsedCollectionId.chainId) {
        throw new Error(
          `User ${user.userChainId} is not on the same chain as collection ${item.parsedCollectionId.chainId}`
        );
      }
      collectionVotes.set(id, collection);
    }

    const votesByCollection = [...collectionVotes.values()];
    const chunks = partitionArray(votesByCollection, CurationService.BULK_VOTE_CHUNK_LIMIT);
    for (const chunk of chunks) {
      await this._voteOnBulkChunk(chunk, user);
    }
  }

  protected async _voteOnBulkChunk(votes: ParsedBulkVotes[], parsedUser: ParsedUserId) {
    const totalVotes = votes.reduce((acc, { votes }) => acc + votes, 0);
    if (votes.length > CurationService.BULK_VOTE_CHUNK_LIMIT) {
      throw new Error('Bulk vote chunk limit exceeded.');
    }

    const collectionRefs = votes.map((item) => item.parsedCollectionId.ref);
    const collectionSnaps = (await this.firebaseService.firestore.getAll(
      ...collectionRefs
    )) as FirebaseFirestore.DocumentSnapshot<Partial<Collection>>[];
    const currentBlock = await this.ethereumService.getCurrentBlock(parsedUser.userChainId);

    await this.firebaseService.firestore.runTransaction(async (txn) => {
      const collectionsVotedOn = new Set<string>();
      const stakingContractChainId = parsedUser.userChainId;
      const stakingContractAddress = this.getStakerAddress(stakingContractChainId);
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        stakingContractChainId,
        stakingContractAddress
      );
      const userStakeRef = parsedUser.ref
        .collection(firestoreConstants.USER_CURATION_COLL)
        .doc(
          `${stakingContractChainId}:${stakingContractAddress}`
        ) as FirebaseFirestore.DocumentReference<UserStakeDto>;

      const userStakeSnap = await txn.get(userStakeRef);
      const userStake: Partial<UserStakeDto> = userStakeSnap.data() ?? {};
      const stakePower = userStake.stakePower ?? 0;
      let totalCuratedVotes = userStake?.totalCuratedVotes ?? 0;
      let totalCurated = userStake?.totalCurated ?? 0;
      const availableVotes = stakePower - totalCuratedVotes;

      if (totalVotes > availableVotes) {
        throw new Error(
          `Insufficient amount of votes available. User has ${availableVotes} votes available, but attempted to use ${totalVotes} votes.`
        ); // TODO improve error handling so this message can be returned to the user
      }

      const curatedCollectionRefs = votes.map((item) => {
        const curatorDocRef = item.parsedCollectionId.ref
          .collection(firestoreConstants.COLLECTION_CURATION_COLL)
          .doc(`${stakingContractChainId}:${stakingContractAddress}`)
          .collection(firestoreConstants.COLLECTION_CURATORS_COLL)
          .doc(parsedUser.ref.id) as FirebaseFirestore.DocumentReference<UserCuratedCollectionDto>;
        return curatorDocRef;
      });
      const curatedCollectionSnaps = await txn.getAll(...curatedCollectionRefs);

      const contracts = {
        stakingContractAddress,
        stakingContractChainId,
        tokenContractAddress,
        tokenContractChainId
      };

      votes.forEach((vote, index) => {
        const collectionSnap = collectionSnaps[index];
        const curatedCollectionSnap = curatedCollectionSnaps[index];
        if (vote.parsedCollectionId.chainId !== parsedUser.userChainId) {
          throw new Error('User is not on the same chain as collection.');
        } else if (collectionsVotedOn.has(vote.parsedCollectionId.address)) {
          throw new Error('Cannot vote on the same collection multiple times.');
        } else if (!collectionSnap || !curatedCollectionSnap) {
          throw new Error('Failed to get collection or curated collection snapshot.');
        }

        const { totalCurated: updatedTotalCurated, totalCuratedVotes: updatedTotalCuratedVotes } = this._vote(
          txn,
          vote,
          parsedUser,
          collectionSnap,
          curatedCollectionSnap,
          totalCurated,
          totalCuratedVotes,
          currentBlock,
          contracts
        );
        totalCurated = updatedTotalCurated;
        totalCuratedVotes = updatedTotalCuratedVotes;
        collectionsVotedOn.add(vote.parsedCollectionId.address);
      });

      const userStakeUpdate: Partial<UserStakeDto> = {
        stakerContractAddress: stakingContractAddress,
        stakerContractChainId: stakingContractChainId,
        totalCurated,
        totalCuratedVotes
      };
      txn.set(userStakeRef, userStakeUpdate, { merge: true });
    });
  }

  protected _vote(
    txn: FirebaseFirestore.Transaction,
    vote: ParsedBulkVotes,
    parsedUser: ParsedUserId,
    collectionSnap: FirebaseFirestore.DocumentSnapshot<Partial<Collection>>,
    curatedCollectionSnap: FirebaseFirestore.DocumentSnapshot<UserCuratedCollectionDto>,
    totalCurated: number,
    totalCuratedVotes: number,
    currentBlock: { number: number; timestamp: number },
    contracts: {
      stakingContractAddress: string;
      stakingContractChainId: ChainId;
      tokenContractAddress: string;
      tokenContractChainId: ChainId;
    }
  ): {
    totalCurated: number;
    totalCuratedVotes: number;
  } {
    const collection = collectionSnap.data() ?? {};
    const curatedCollection: Partial<UserCuratedCollectionDto> = curatedCollectionSnap.data() ?? {};
    const curatedCollectionVotes = curatedCollection.curator?.votes ?? 0;

    const curatedCollectionUpdate: UserCuratedCollectionDto = {
      curator: {
        address: parsedUser.userAddress,
        votes: curatedCollectionVotes + vote.votes,
        fees: 0,
        feesAPR: 0
      },
      timestamp: Date.now(),
      address: vote.parsedCollectionId.address,
      chainId: vote.parsedCollectionId.chainId,
      name: collection?.metadata?.name ?? '',
      profileImage: collection?.metadata?.profileImage ?? '',
      bannerImage: collection?.metadata?.bannerImage ?? '',
      slug: collection?.slug ?? '',
      fees: 0,
      feesAPR: 0,
      numCuratorVotes: 0,
      stakerContractAddress: contracts.stakingContractAddress,
      stakerContractChainId: contracts.stakingContractChainId,
      tokenContractAddress: contracts.tokenContractAddress,
      tokenContractChainId: contracts.tokenContractChainId,
      hasBlueCheck: collection?.hasBlueCheck ?? false
    };

    const voteEvent: CurationVotesAdded = {
      votes: vote.votes,
      collectionAddress: vote.parsedCollectionId.address,
      collectionChainId: vote.parsedCollectionId.chainId,
      stakerContractAddress: contracts.stakingContractAddress,
      stakerContractChainId: contracts.stakingContractChainId,
      userAddress: parsedUser.userAddress,
      discriminator: CurationLedgerEvent.VotesAdded,
      blockNumber: currentBlock.number,
      timestamp: currentBlock.timestamp * 1000,
      updatedAt: Date.now(),
      tokenContractAddress: contracts.tokenContractAddress,
      tokenContractChainId: contracts.tokenContractChainId,
      isStakeMerged: false,
      isAggregated: false,
      isDeleted: false,
      isFeedUpdated: false
    };

    const collectionStakingDocRef = vote.parsedCollectionId.ref
      .collection(firestoreConstants.COLLECTION_CURATION_COLL)
      .doc(`${contracts.stakingContractChainId}:${contracts.stakingContractAddress}`);
    const voteEventRef = collectionStakingDocRef.collection(firestoreConstants.CURATION_LEDGER_COLL).doc();

    txn.set(curatedCollectionSnap.ref, curatedCollectionUpdate, { merge: true });
    txn.create(voteEventRef, voteEvent);

    if (curatedCollectionVotes === 0) {
      totalCurated += 1;
    }
    totalCuratedVotes += vote.votes;

    return {
      totalCurated,
      totalCuratedVotes
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
    collection: Omit<ParsedCollectionId, 'ref'>,
    collectionData: Partial<Collection>
  ): Promise<UserCuratedCollectionDto> {
    const stakingContractChainId = user.userChainId;
    const stakingContractAddress = this.getStakerAddress(stakingContractChainId);
    const curationSnippetRef = this.firebaseService.firestore
      .collection(`${firestoreConstants.COLLECTIONS_COLL}`)
      .doc(`${collection.chainId}:${collection.address}`)
      .collection(firestoreConstants.COLLECTION_CURATION_COLL)
      .doc(`${stakingContractChainId}:${stakingContractAddress}`)
      .collection('curationSnippets')
      .doc(firestoreConstants.CURATION_SNIPPET_DOC) as FirebaseFirestore.DocumentReference<CurrentCurationSnippetDoc>;

    const curatorRef = curationSnippetRef
      .collection(firestoreConstants.CURATION_SNIPPET_USERS_COLL)
      .doc(user.userAddress) as FirebaseFirestore.DocumentReference<CurationBlockUser>;

    const curatorSnap = await curatorRef.get();
    const curator = curatorSnap.data();
    const curationSnippetSnap = await curationSnippetRef.get();
    const curationSnippet = curationSnippetSnap.data();
    if (!curator) {
      const tokenContract = getTokenAddressByStakerAddress(stakingContractChainId, stakingContractAddress);
      const curatedCollection: UserCuratedCollectionDto = {
        address: collection.address,
        chainId: collection.chainId,
        stakerContractAddress: stakingContractAddress,
        stakerContractChainId: stakingContractChainId,
        tokenContractAddress: tokenContract.tokenContractAddress,
        tokenContractChainId: tokenContract.tokenContractChainId,
        curator: {
          address: user.userAddress,
          votes: 0,
          fees: 0,
          feesAPR: 0
        },
        fees: curationSnippet?.stats.feesAccruedEth ?? 0,
        feesAPR: curationSnippet?.stats.feesAPR ?? 0,
        timestamp: Date.now(),
        slug: curationSnippet?.collection?.slug ?? collectionData?.slug ?? '',
        numCuratorVotes: curationSnippet?.stats?.numCuratorVotes ?? 0,
        profileImage: curationSnippet?.collection?.profileImage ?? collectionData?.metadata?.profileImage ?? '',
        bannerImage: curationSnippet?.collection.bannerImage ?? '',
        name: curationSnippet?.collection?.name ?? collectionData?.metadata?.name ?? '',
        hasBlueCheck: curationSnippet?.collection?.hasBlueCheck ?? collectionData?.hasBlueCheck ?? false
      };
      return curatedCollection;
    }

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
      fees: curationSnippet?.stats.feesAccruedEth ?? 0,
      feesAPR: curationSnippet?.stats.feesAPR ?? 0,
      timestamp: curator.metadata.updatedAt,
      slug: curator.collection.slug,
      numCuratorVotes: curator.stats.numCuratorVotes,
      profileImage: curator.collection.profileImage,
      bannerImage: curator.collection.bannerImage,
      name: curator.collection.name,
      hasBlueCheck: curator.collection.hasBlueCheck
    };

    return curatedCollection;
  }

  getUserRewards(
    user: ParsedUserId
  ): { totalProtocolFeesAccruedEth: number; totalProtocolFeesAccruedWei: string } {
    const totalProtocolFeesAccruedWei = '0';
    return {
      totalProtocolFeesAccruedWei,
      totalProtocolFeesAccruedEth: formatEth(totalProtocolFeesAccruedWei)
    };

    // const stakerContractChainId = user.userChainId;
    // const stakingContract = this.getStakerAddress(stakerContractChainId);
    // const stakingContractPeriods = this.firebaseService.firestore
    //   .collectionGroup('stakerContractCurationPeriodsUsers')
    //   .where('metadata.userAddress', '==', user.userAddress)
    //   .where(
    //     'metadata.stakerContractAddress',
    //     '==',
    //     stakingContract
    //   ) as FirebaseFirestore.Query<StakerContractPeriodUserDoc>;

    // const stream = streamQuery(stakingContractPeriods, (item, ref) => [ref], { pageSize: 300 });

    // const results: StakerContractPeriodUserDoc[] = [];
    // for await (const item of stream) {
    //   results.push(item);
    // }

    // const protocolFeeStats = calculateStatsBigInt(results, (item) => BigInt(item.stats.periodProtocolFeesAccruedWei));

    // const totalProtocolFeesAccruedWei = protocolFeeStats.sum.toString();
    // return {
    //   totalProtocolFeesAccruedWei,
    //   totalProtocolFeesAccruedEth: formatEth(totalProtocolFeesAccruedWei)
    // };
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

    const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
      stakerContractChainId,
      stakerContractAddress
    );
    return {
      stakerContractAddress: snap.get('stakerContractAddress') || stakerContractAddress,
      stakerContractChainId: snap.get('stakerContractChainId') || stakerContractChainId,
      stakeInfo: snap.get('stakeInfo') || {
        [StakeDuration.None]: {
          amount: '0',
          timestamp: NaN
        },
        [StakeDuration.ThreeMonths]: {
          amount: '0',
          timestamp: NaN
        },
        [StakeDuration.SixMonths]: {
          amount: '0',
          timestamp: NaN
        },
        [StakeDuration.TwelveMonths]: {
          amount: '0',
          timestamp: NaN
        }
      },
      stakePower: snap.get('stakePower') ?? 0,
      blockUpdatedAt: snap.get('blockUpdatedAt') ?? NaN,
      totalCurated: snap.get('totalCurated') || 0,
      totalCuratedVotes: snap.get('totalCuratedVotes') || 0,
      tokenContractAddress: snap.get('tokenContractAddress') || tokenContractAddress,
      tokenContractChainId: snap.get('tokenContractChainId') || tokenContractChainId
    };
  }

  async getUserCurationQuota(user: ParsedUserId) {
    const tokenBalance = await this.getTokenBalance(user);
    const stake = await this.getUserCurationInfo(user);
    const stakeLevel = await this.stakerContractService.getStakeLevel(user);
    const quota: CurationQuotaDto = {
      stake,
      stakeLevel,
      tokenBalance,
      totalStaked: getTotalStaked(stake.stakeInfo, 8),
      availableVotes: stake.stakePower - stake.totalCuratedVotes
    };

    return quota;
  }

  getStakerAddress(chainId: ChainId) {
    return this.stakerContractService.getStakerAddress(chainId);
  }
}
