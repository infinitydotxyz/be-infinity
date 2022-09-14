/* eslint-disable @typescript-eslint/no-unused-vars */
import { ChainId, Phase, RaffleTicketPhaseDoc, UserRaffleTickets } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import {
  RaffleQueryDto,
  PhaseRaffleDto,
  UserRaffleTicketsDto,
  RaffleLeaderboardQueryDto
} from '@infinityxyz/lib/types/dto';
import { UserService } from 'user/user.service';

@Injectable()
export class RaffleService {
  constructor(
    protected firebaseService: FirebaseService,
    protected stakerContractService: StakerContractService,
    protected cursorService: CursorService,
    protected userService: UserService
  ) {}

  async getRaffle(query: RaffleQueryDto, phase: Phase): Promise<null | PhaseRaffleDto> {
    const { phaseRaffleRef } = this.getRaffleRefs(query, phase);
    const phaseRaffleSnapshot = await phaseRaffleRef.get();
    const phaseRaffleDoc = phaseRaffleSnapshot.data() as RaffleTicketPhaseDoc;
    if (!phaseRaffleDoc) {
      return null;
    }
    const { blockNumber, ...phaseRaffle } = phaseRaffleDoc;

    return phaseRaffle;
  }

  async getUserRaffleTickets(
    query: RaffleQueryDto,
    phase: Phase,
    user: ParsedUserId
  ): Promise<{ user: UserRaffleTicketsDto } | null> {
    const { phaseRaffleUsersRef } = this.getRaffleRefs(query, phase);
    const userRaffleTicketsRef = phaseRaffleUsersRef.doc(user.userAddress);

    const userSnapshot = await userRaffleTicketsRef.get();
    const userRaffleTicketsDoc = userSnapshot.data() as UserRaffleTickets;

    if (!userRaffleTicketsDoc) {
      return null;
    }

    const userRaffleTicketsArray = await this.transformUserRaffleTickets([userRaffleTicketsDoc]);
    const userRaffleTickets = userRaffleTicketsArray[0];

    if (!userRaffleTickets) {
      return null;
    }

    return { user: userRaffleTickets };
  }

  async getLeaderboard(
    query: RaffleLeaderboardQueryDto,
    phase: Phase
  ): Promise<null | { hasNextPage: boolean; data: UserRaffleTicketsDto[]; cursor: string }> {
    type Cursor = {
      rank: number;
    };
    const { phaseRaffleUsersRef } = this.getRaffleRefs(query, phase);
    const queryCursor = this.cursorService.decodeCursorToObject<Cursor>(query.cursor);

    const limit = query.limit + 1;
    const leaderboardQuery = phaseRaffleUsersRef
      .orderBy('rank', query.orderDirection)
      .startAfter(queryCursor.rank ?? 0)
      .limit(limit);

    const leaderboardSnapshot = await leaderboardQuery.get();

    const leaderboard = leaderboardSnapshot.docs.map((doc) => doc.data());
    const hasNextPage = leaderboard.length > query.limit;
    const updatedCursorObj = { rank: leaderboard[leaderboard.length - 1]?.rank ?? queryCursor.rank ?? 0 };

    const leaderboardResults = leaderboard.slice(0, query.limit - 1);

    const results = await this.transformUserRaffleTickets(leaderboardResults);

    return {
      hasNextPage,
      data: results,
      cursor: this.cursorService.encodeCursor(updatedCursorObj)
    };
  }

  protected getRaffleRefs(raffleQuery: RaffleQueryDto, phase: Phase) {
    const chainId = raffleQuery.chainId ?? ChainId.Mainnet;
    const stakerContract = this.stakerContractService.getStakerAddress(chainId);
    const phaseRaffleRef = this.firebaseService.firestore
      .collection(firestoreConstants.RAFFLE_TICKETS_COLL)
      .doc(`${chainId}:${stakerContract}`)
      .collection(firestoreConstants.RAFFLE_TICKETS_PHASES_COLL)
      .doc(phase) as FirebaseFirestore.DocumentReference<RaffleTicketPhaseDoc>;

    const phaseRaffleUsersRef = phaseRaffleRef.collection(
      firestoreConstants.RAFFLE_TICKETS_PHASE_USERS_COLL
    ) as FirebaseFirestore.CollectionReference<UserRaffleTickets>;

    return {
      phaseRaffleRef,
      phaseRaffleUsersRef
    };
  }

  protected async transformUserRaffleTickets(userRaffleTickets: UserRaffleTickets[]): Promise<UserRaffleTicketsDto[]> {
    if (userRaffleTickets.length === 0) {
      return [];
    }
    const userProfiles = await this.userService.getUserProfilesDisplayData(
      userRaffleTickets.map((user) => user.userAddress)
    );

    return userRaffleTickets.map((user, index) => {
      const { isFinalized, blockNumber, ...rest } = user;
      return {
        ...rest,
        user: userProfiles[index]
      };
    });
  }
}
