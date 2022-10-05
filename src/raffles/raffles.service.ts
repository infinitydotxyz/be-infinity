/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ChainId,
  FinalizedUserRaffleEntrant,
  OrderDirection,
  RaffleEntrant,
  RaffleRewardsDoc,
  RaffleState,
  RaffleTicketTotalsDoc,
  RaffleType,
  StakingContractRaffle,
  UserRaffle,
  UserRaffleConfig
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import {
  RaffleQueryDto,
  RaffleLeaderboardQueryDto,
  TokenomicsConfigDto,
  RaffleLeaderboardUser
} from '@infinityxyz/lib/types/dto';
import { UserService } from 'user/user.service';
import { RaffleQueryState, RafflesQueryDto } from './types';
import { raffleStateByRaffleQueryState } from './constants';
import { RewardsService } from 'rewards/rewards.service';

type Raffle = UserRaffle & {
  progress: number;
  totals: {
    numUniqueEntrants: number;
    totalNumTickets: number;
    prizePoolEth: number;
    prizePoolWei: string;
  };
};

@Injectable()
export class RafflesService {
  constructor(
    protected firebaseService: FirebaseService,
    protected stakerContractService: StakerContractService,
    protected cursorService: CursorService,
    protected userService: UserService,
    protected rewardsService: RewardsService
  ) {}

  // async getRaffle(query: RaffleQueryDto, phaseId: 'current' | string): Promise<null> {
  //   const phaseRafflesRef = this.getRaffleRefs(query);

  //   // const { phaseRaffleRef } = this.getRaffleRefs(query, phaseId);
  //   // const phaseRaffleSnapshot = await phaseRaffleRef.get();
  //   // const phaseRaffleDoc = phaseRaffleSnapshot.data();
  //   // if (!phaseRaffleDoc) {
  //   //   return null;
  //   // }
  //   // const { blockNumber, ...phaseRaffle } = phaseRaffleDoc;

  //   // return phaseRaffle;
  //   await Promise.resolve();
  //   return null;
  // }

  async getRaffles(query: RafflesQueryDto): Promise<Raffle[] | null> {
    const tokenomicsConfig = await this.rewardsService.getConfig(query.chainId ?? ChainId.Mainnet);
    if (!tokenomicsConfig) {
      return null;
    }

    if (!query.states || query.states.length === 0) {
      query.states = [RaffleQueryState.Active];
    }
    const states: RaffleState[] = query.states.flatMap((item) => raffleStateByRaffleQueryState[item]);
    const validRaffles = await this._getRafflesInStates(query, states);

    const raffleTotalsRefs = validRaffles.map((item) => {
      const totalsRef = item.ref.collection(firestoreConstants.RAFFLE_TOTALS_COLL);
      const ticketTotalsRef = totalsRef.doc(
        firestoreConstants.RAFFLE_TICKET_TOTALS_DOC
      ) as FirebaseFirestore.DocumentReference<RaffleTicketTotalsDoc>;
      const rewardsTotalsRef = totalsRef.doc(
        firestoreConstants.RAFFLE_TOTALS_REWARDS_DOC
      ) as FirebaseFirestore.DocumentReference<RaffleRewardsDoc>;

      return {
        ticketTotalsRef,
        rewardsTotalsRef
      };
    });

    const raffleTicketTotals = await this.firebaseService.firestore.getAll(
      ...raffleTotalsRefs.map((item) => item.ticketTotalsRef)
    );
    const raffleRewards = await this.firebaseService.firestore.getAll(
      ...raffleTotalsRefs.map((item) => item.rewardsTotalsRef)
    );

    const raffles = validRaffles.map(({ data }, index) => {
      const ticketTotals = (raffleTicketTotals[index]?.data() ?? {}) as Partial<RaffleTicketTotalsDoc>;
      const rewards = (raffleRewards[index]?.data() ?? {}) as Partial<RaffleRewardsDoc>;
      return this._transformRaffle(data, ticketTotals, rewards, tokenomicsConfig);
    });

    return raffles;
  }

  async getUserRaffleTickets(
    raffleQuery: RaffleQueryDto,
    raffleId: string,
    user: ParsedUserId
  ): Promise<RaffleLeaderboardUser | null> {
    const raffleRef = this._getPhaseRaffleRef(raffleQuery, raffleId);

    const raffleSnap = await raffleRef.get();
    const raffle = raffleSnap.data();
    if (!raffle) {
      return null;
    }

    const raffleTicketTotals = await this._getRaffleTicketTotals(raffleRef);

    const entrantsRef = raffleRef.collection(
      firestoreConstants.RAFFLE_ENTRANTS_COLL
    ) as FirebaseFirestore.CollectionReference<RaffleEntrant>;

    const entrantRef = entrantsRef.doc(user.userAddress);
    const doc = await entrantRef.get();
    const raffleEntrant = doc.data();

    const defaultEntrant: RaffleLeaderboardUser = {
      stakerContractAddress: raffle.stakerContractAddress,
      raffleId: raffle.id,
      entrant: {
        address: user.userAddress,
        displayName: '',
        username: '',
        profileImage: '',
        bannerImage: ''
      },
      numTickets: 0,
      updatedAt: Date.now(),
      data: {
        volumeUSDC: 0,
        numValidOffers: 0,
        numValidListings: 0,
        numTicketsFromOffers: 0,
        numTicketsFromListings: 0,
        numTicketsFromVolume: 0
      },
      chainId: raffle.chainId,
      tickets: null,
      probability: 0
    };

    if (!raffleEntrant) {
      return defaultEntrant;
    }

    const results = this._transformUserRaffleTickets(
      [raffleEntrant],
      raffleTicketTotals?.totalNumTickets != null
        ? BigInt(raffleTicketTotals?.totalNumTickets as number | bigint)
        : BigInt(0)
    );

    if (!results[0]) {
      defaultEntrant;
    }

    return results[0];
  }

  async getLeaderboard(
    raffleQuery: RaffleLeaderboardQueryDto,
    raffleId: string
  ): Promise<null | { hasNextPage: boolean; cursor: string; data: RaffleLeaderboardUser[] }> {
    const raffleRef = this._getPhaseRaffleRef(raffleQuery, raffleId);

    const raffleSnap = await raffleRef.get();
    const raffle = raffleSnap.data();
    if (!raffle) {
      return null;
    }

    const raffleTicketTotals = await this._getRaffleTicketTotals(raffleRef);

    const entrantsRef = raffleRef.collection(
      firestoreConstants.RAFFLE_ENTRANTS_COLL
    ) as FirebaseFirestore.CollectionReference<RaffleEntrant>;

    type Cursor = {
      numTickets: number;
      entrantAddress: string;
    };

    const cursor = this.cursorService.decodeCursorToObject<Cursor>(raffleQuery.cursor);

    let query = entrantsRef.orderBy('numTickets', 'desc').orderBy('entrant.address', 'desc');

    if (typeof cursor.numTickets === 'number' && cursor.entrantAddress) {
      query = query.startAt([cursor.numTickets, cursor.entrantAddress]);
    }
    query = query.limit(raffleQuery.limit + 1);

    const snapshot = await query.get();

    const raffleEntrants = snapshot.docs.map((doc) => doc.data());

    const hasNextPage = raffleEntrants.length > raffleQuery.limit;
    if (hasNextPage) {
      raffleEntrants.pop();
    }

    const lastItem = raffleEntrants[raffleEntrants.length - 1];

    const cursorObj: Cursor = {
      numTickets: lastItem?.numTickets ?? cursor?.numTickets,
      entrantAddress: lastItem?.entrant.address ?? cursor?.entrantAddress
    };

    const results = this._transformUserRaffleTickets(
      raffleEntrants,
      raffleTicketTotals?.totalNumTickets != null
        ? BigInt(raffleTicketTotals?.totalNumTickets as number | bigint)
        : BigInt(0)
    );

    return {
      hasNextPage,
      data: results,
      cursor: this.cursorService.encodeCursor(cursorObj)
    };
  }

  protected async _getRafflesInStates(raffleQuery: RaffleQueryDto, states: RaffleState[]) {
    const phaseRaffles = await this._getPhaseRaffles(raffleQuery);

    const currentRaffles = phaseRaffles.filter((raffle) => states.includes(raffle.data.state));

    return currentRaffles;
  }

  protected async _getPhaseRaffles(raffleQuery: RaffleQueryDto) {
    const rafflesRef = this._getRaffleRefs(raffleQuery);
    const rafflesQuery = rafflesRef.where('type', '==', RaffleType.User);
    const rafflesSnap = await rafflesQuery.get();
    const raffles = rafflesSnap.docs.map((doc) => ({ ref: doc.ref, data: doc.data() }));

    return raffles;
  }

  protected _getPhaseRaffleRef(raffleQuery: RaffleQueryDto, raffleId: string) {
    const rafflesRef = this._getRaffleRefs(raffleQuery);

    const raffle = rafflesRef.doc(raffleId);
    return raffle;
  }

  protected _getRaffleRefs(raffleQuery: RaffleQueryDto) {
    const chainId = raffleQuery.chainId ?? ChainId.Mainnet;
    const stakerContract = this.stakerContractService.getStakerAddress(chainId);
    const rafflesRef = this.firebaseService.firestore
      .collection(firestoreConstants.RAFFLES_COLL)
      .doc(`${chainId}:${stakerContract}`)
      .collection(
        firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL
      ) as FirebaseFirestore.CollectionReference<UserRaffle>;

    return rafflesRef;
  }

  protected _getRaffleProgress(raffle: StakingContractRaffle, rewardsConfig: TokenomicsConfigDto) {
    const activePhases = raffle.activePhaseIds;
    const phases = rewardsConfig.phases.filter((item) => activePhases.includes(item.id));
    if (phases.length === 0) {
      return 0;
    }
    const phaseContribution = 1 / phases.length;
    const progress = phases.reduce((acc, item) => acc + item.progress * phaseContribution, 0);
    return progress;
  }

  protected async _getRaffleTicketTotals(
    raffleRef: FirebaseFirestore.DocumentReference<StakingContractRaffle>
  ): Promise<RaffleTicketTotalsDoc | null> {
    const totalsCollection = raffleRef.collection(firestoreConstants.RAFFLE_TOTALS_COLL);
    const ticketTotalsRef = totalsCollection.doc(
      firestoreConstants.RAFFLE_TICKET_TOTALS_DOC
    ) as FirebaseFirestore.DocumentReference<RaffleTicketTotalsDoc>;
    const ticketTotalsSnap = await ticketTotalsRef.get();
    const ticketTotals = ticketTotalsSnap.data();
    if (!ticketTotals) {
      return null;
    }
    return ticketTotals;
  }

  protected _transformUserRaffleTickets(
    raffleEntrants: RaffleEntrant[],
    totalNumTickets: bigint
  ): RaffleLeaderboardUser[] {
    const results = raffleEntrants.map((item) => {
      const probabilityBigInt =
        totalNumTickets > BigInt(0) && item.numTickets > 0
          ? BigInt(item.numTickets * 100_000) / totalNumTickets
          : BigInt(0);

      const probability = parseInt(probabilityBigInt.toString(), 10) / 1_000;

      const res: RaffleLeaderboardUser = {
        chainId: item.chainId,
        stakerContractAddress: item.stakerContractAddress,
        raffleId: item.raffleId,
        entrant: item.entrant,
        numTickets: item.numTickets,
        updatedAt: item.updatedAt,
        tickets: item.isFinalized ? item.tickets : null,
        data: item.data,
        probability
      };

      return res;
    });

    return results;
  }

  protected _transformRaffle(
    userRaffle: UserRaffle,
    ticketTotals: Partial<RaffleTicketTotalsDoc>,
    rewardsTotals: Partial<RaffleRewardsDoc>,
    tokenomicsConfig: TokenomicsConfigDto
  ): Raffle {
    const raffle: Raffle = {
      ...userRaffle,
      progress: this._getRaffleProgress(userRaffle, tokenomicsConfig),
      totals: {
        numUniqueEntrants: ticketTotals?.numUniqueEntrants ?? 0,
        totalNumTickets: parseInt((ticketTotals?.totalNumTickets ?? BigInt(0)).toString(), 10),
        prizePoolWei: rewardsTotals?.prizePoolWei ?? '0',
        prizePoolEth: rewardsTotals?.prizePoolEth ?? 0
      }
    };

    return raffle;
  }
}
