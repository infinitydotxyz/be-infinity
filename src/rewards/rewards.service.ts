import { AllTimeTransactionFeeRewardsDoc, ChainId } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TokenomicsPhaseDto, UserRewardsDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CurationService } from 'collections/curation/curation.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class RewardsService {
  constructor(protected firebaseService: FirebaseService, protected curationService: CurationService) {}

  async getConfig(chainId: ChainId): Promise<TokenomicsConfigDto | null> {
    const rewardsProgramRef = this.firebaseService.firestore
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(chainId) as FirebaseFirestore.DocumentReference<TokenomicsConfigDto>;

    const snap = await rewardsProgramRef.get();
    const program = snap.data();
    if (!program) {
      return null;
    }

    let encounteredActivePhase = false;
    for (const phase of program.phases) {
      if (phase.isActive && !encounteredActivePhase) {
        encounteredActivePhase = true;
      } else if (phase.isActive && encounteredActivePhase) {
        phase.isActive = false;
      }
    }

    program.phases = program.phases.filter((item) => item.id !== '5');

    return program;
  }

  async getUserRewards(chainId: ChainId, parsedUser: ParsedUserId): Promise<UserRewardsDto> {
    const userRewardRef = parsedUser.ref.collection(firestoreConstants.USER_REWARDS_COLL).doc(chainId);
    const userAllTimeRewards = userRewardRef
      .collection(firestoreConstants.USER_ALL_TIME_REWARDS_COLL)
      .doc(
        firestoreConstants.USER_ALL_TIME_TXN_FEE_REWARDS_DOC
      ) as FirebaseFirestore.DocumentReference<AllTimeTransactionFeeRewardsDoc>;

    const userTotalSnap = await userAllTimeRewards.get();
    const userTotalRewards = userTotalSnap.data() ?? null;
    const v1Airdrop = userTotalRewards?.v1Airdrop ?? 0;
    const totalUserReward = (userTotalRewards?.rewards ?? 0) + v1Airdrop;

    const userCurationTotals = await this.curationService.getUserRewards(parsedUser);
    const claimingAddress = '0xbada55c9c42e573047c76eb65e29d853f7b77b9c'.toLowerCase();

    const rewards: UserRewardsDto = {
      chainId,
      totals: {
        tradingRefund: {
          volume: userTotalRewards?.volumeEth ?? 0,
          rewards: totalUserReward,
          sells: userTotalRewards?.userSells ?? 0,
          buys: userTotalRewards?.userBuys ?? 0,
          claim: {
            contractAddress: '',
            claimedWei: '0',
            claimedEth: 0,
            claimableWei: '0',
            claimableEth: 0,
            account: parsedUser.userAddress,
            cumulativeAmount: '0',
            merkleRoot: '',
            merkleProof: []
          }
        },
        curation: {
          totalRewardsWei: userCurationTotals.totalProtocolFeesAccruedWei,
          totalRewardsEth: userCurationTotals.totalProtocolFeesAccruedEth,
          claim: {
            contractAddress: '',
            claimedWei: '0',
            claimedEth: 0,
            claimableWei: '0',
            claimableEth: 0,
            account: parsedUser.userAddress,
            cumulativeAmount: '0',
            merkleRoot: '',
            merkleProof: []
          }
        }
      }
    };

    return rewards;

    // return {
    //   chainId,
    //   totals: {
    //     userVolume: userTotalRewards?.volumeEth ?? 0,
    //     userRewards: totalUserReward,
    //     userSells: userTotalRewards?.userSells ?? 0,
    //     userBuys: userTotalRewards?.userBuys ?? 0,
    //     userCurationRewardsWei: userCurationTotals.totalProtocolFeesAccruedWei,
    //     userCurationRewardsEth: userCurationTotals.totalProtocolFeesAccruedEth
    //     tradingRefund: {
    //       claimingAddress,
    //       volume: userTotalRewards?.volumeEth ?? 0,
    //       sells: userTotalRewards?.userSells ?? 0,
    //       buys: userTotalRewards?.userBuys ?? 0,
    //       rewardsWei: userCurationTotals.totalProtocolFeesAccruedWei,
    //       rewardsEth: userCurationTotals.totalProtocolFeesAccruedEth
    //       claimedWei: '0',
    //       claimedEth: 0,
    //       claimableWei: '0',
    //       claimableEth: 0
    //     };

    //     curation: {
    //       claimingAddress: string;
    //       rewardsWei: string;
    //       totalRewardsEth: number;
    //       claimableWei: string;
    //       claimableEth: number;
    //       claimedWei: string;
    //       claimedEth: number;
    //     };

    //   }
  }

  async getActivePhase(chainId: ChainId): Promise<TokenomicsPhaseDto> {
    const tokenomicsConfig = await this.getConfig(chainId);

    const activePhase = tokenomicsConfig?.phases.find((phase) => phase.isActive);

    if (!activePhase) {
      throw new Error('Current active phase not found');
    }

    return activePhase;
  }

  async getInactivePhases(chainId: ChainId): Promise<TokenomicsPhaseDto[]> {
    const tokenomicsConfig = await this.getConfig(chainId);

    const inactivePhases = tokenomicsConfig?.phases.filter((phase) => !phase.isActive);

    return inactivePhases ?? [];
  }

  async getPhase(chainId: ChainId, phaseId: string): Promise<TokenomicsPhaseDto | undefined> {
    const tokenomicsConfig = await this.getConfig(chainId);
    return tokenomicsConfig?.phases.find((phase) => phase.id == phaseId);
  }
}
