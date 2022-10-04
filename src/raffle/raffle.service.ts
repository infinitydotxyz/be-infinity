/* eslint-disable @typescript-eslint/no-unused-vars */
import { ChainId, OrderDirection } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { RaffleQueryDto, RaffleLeaderboardQueryDto } from '@infinityxyz/lib/types/dto';
import { UserService } from 'user/user.service';

@Injectable()
export class RaffleService {
  constructor(
    protected firebaseService: FirebaseService,
    protected stakerContractService: StakerContractService,
    protected cursorService: CursorService,
    protected userService: UserService
  ) {}

  async getRaffle(query: RaffleQueryDto, phaseId: string): Promise<null> {
    // const { phaseRaffleRef } = this.getRaffleRefs(query, phaseId);
    // const phaseRaffleSnapshot = await phaseRaffleRef.get();
    // const phaseRaffleDoc = phaseRaffleSnapshot.data();
    // if (!phaseRaffleDoc) {
    //   return null;
    // }
    // const { blockNumber, ...phaseRaffle } = phaseRaffleDoc;

    // return phaseRaffle;
    await Promise.resolve();
    return null;
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

  async getLeaderboard(query: RaffleLeaderboardQueryDto, phaseId: string): Promise<null> {
    // type Cursor = {
    //   rank: number;
    // };
    // const { phaseRaffleUsersRef } = this.getRaffleRefs(query, phase);
    // const queryCursor = this.cursorService.decodeCursorToObject<Cursor>(query.cursor);

    // const limit = query.limit + 1;
    // const leaderboardQuery = phaseRaffleUsersRef
    //   .orderBy('rank', query.orderDirection ?? OrderDirection.Ascending)
    //   .startAt(queryCursor.rank ?? 0)
    //   .limit(limit);

    // const leaderboardSnapshot = await leaderboardQuery.get();

    // const leaderboard = leaderboardSnapshot.docs.map((doc) => doc.data());
    // const hasNextPage = leaderboard.length > query.limit;
    // const updatedCursorObj = { rank: leaderboard[leaderboard.length - 1]?.rank ?? queryCursor.rank ?? 0 };

    // const leaderboardResults = leaderboard.slice(0, query.limit);

    // const results = await this.transformUserRaffleTickets(leaderboardResults);

    // return {
    //   hasNextPage,
    //   data: results,
    //   cursor: this.cursorService.encodeCursor(updatedCursorObj)
    // };
    await Promise.resolve();
    return null;
  }

  protected getRaffleRefs(raffleQuery: RaffleQueryDto, phaseId: string) {
    //   const chainId = raffleQuery.chainId ?? ChainId.Mainnet;
    //   const stakerContract = this.stakerContractService.getStakerAddress(chainId);
    //   const phaseRaffleRef = this.firebaseService.firestore
    //     .collection(firestoreConstants.RAFFLE_TICKETS_COLL)
    //     .doc(`${chainId}:${stakerContract}`)
    //     .collection(firestoreConstants.RAFFLE_TICKETS_PHASES_COLL)
    //     .doc(phase) as FirebaseFirestore.DocumentReference<any>;

    //   const phaseRaffleUsersRef = phaseRaffleRef.collection(
    //     firestoreConstants.RAFFLE_TICKETS_PHASE_USERS_COLL
    //   ) as FirebaseFirestore.CollectionReference<UserRaffleTickets>;

    //   return {
    //     phaseRaffleRef,
    //     phaseRaffleUsersRef
    //   };
    // }

    // protected async transformUserRaffleTickets(userRaffleTickets: UserRaffleTickets[]): Promise<UserRaffleTicketsDto[]> {
    //   if (userRaffleTickets.length === 0) {
    //     return [];
    //   }
    //   const userProfiles = await this.userService.getUserProfilesDisplayData(
    //     userRaffleTickets.map((user) => user.userAddress)
    //   );

    //   return userRaffleTickets.map((user, index) => {
    //     const { isFinalized, blockNumber, ...rest } = user;
    //     return {
    //       ...rest,
    //       user: userProfiles[index]
    //     };
    //   });
    return null;
  }
}
