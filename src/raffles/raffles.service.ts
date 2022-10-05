/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ChainId,
  FinalizedUserRaffleEntrant,
  OrderDirection,
  RaffleEntrant,
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
import { RaffleQueryDto, RaffleLeaderboardQueryDto, TokenomicsConfigDto } from '@infinityxyz/lib/types/dto';
import { UserService } from 'user/user.service';
import { RaffleQueryState, RafflesQueryDto } from './types';
import { raffleStateByRaffleQueryState } from './constants';
import { RewardsService } from 'rewards/rewards.service';

type RaffleLeaderboardUser = Pick<
  RaffleEntrant,
  'stakerContractAddress' | 'raffleId' | 'entrant' | 'numTickets' | 'updatedAt' | 'data' | 'chainId'
> &
  ({ tickets: null } | Pick<FinalizedUserRaffleEntrant, 'tickets'>) & { probability: number };

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

  async getRaffles(query: RafflesQueryDto): Promise<StakingContractRaffle[] | null> {
    const tokenomicsConfig = await this.rewardsService.getConfig(query.chainId ?? ChainId.Mainnet);
    if (!tokenomicsConfig) {
      return null;
    }

    if (!query.states || query.states.length === 0) {
      query.states = [RaffleQueryState.Active];
    }
    const states: RaffleState[] = query.states.flatMap((item) => raffleStateByRaffleQueryState[item]);
    const raffles = await this._getRafflesInStates(query, states);

    const raffleData = raffles.map((item) => ({
      ...item.data,
      progress: this._getRaffleProgress(item.data, tokenomicsConfig)
    }));

    return raffleData;
  }

  async getUserRaffleTickets(query: RaffleQueryDto, phase: string, user: ParsedUserId): Promise<null> {
    // const { phaseRaffleUsersRef } = this.getRaffleRefs(query, phase);
    // const userRaffleTicketsRef = phaseRaffleUsersRef.doc(user.userAddress);

    // const userSnapshot = await userRaffleTicketsRef.get();
    // let userRaffleTicketsDoc = userSnapshot.data() as UserRaffleTickets;

    // if (!userRaffleTicketsDoc) {
    //   const raffle = await this.getRaffle(query, phase);
    //   if (!raffle) {
    //     return null;
    //   }
    //   userRaffleTicketsDoc = {
    //     userAddress: user.userAddress,
    //     numTickets: 0,
    //     chainId: raffle.chainId,
    //     stakerContractAddress: raffle.stakerContractAddress,
    //     blockNumber: 0,
    //     epoch: raffle.epoch,
    //     phase: raffle.phase,
    //     volumeUSDC: 0,
    //     chanceOfWinning: 0,
    //     rank: Number.NaN,
    //     isFinalized: raffle.isFinalized,
    //     updatedAt: Date.now()
    //   } as NonFinalizedUserRaffleTickets;
    // }

    // const userRaffleTicketsArray = await this.transformUserRaffleTickets([userRaffleTicketsDoc]);
    // const userRaffleTickets = userRaffleTicketsArray[0];

    // if (!userRaffleTickets) {
    //   return null;
    // }

    // return userRaffleTickets;
    await Promise.resolve();
    return null;
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

    const results = this._transformUserRaffleTickets(raffleEntrants, raffleTicketTotals?.totalNumTickets ?? BigInt(0));

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
      ) as FirebaseFirestore.CollectionReference<StakingContractRaffle>;

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
          ? (BigInt(item.numTickets) / totalNumTickets) * BigInt(100_000_000)
          : BigInt(0);

      const probability = Number(probabilityBigInt) / 1_000_000;

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
}
