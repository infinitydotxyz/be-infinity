import {
  AllTimeTransactionFeeRewardsDoc,
  ChainId,
  Epoch,
  RewardProgram,
  TransactionFeePhaseRewardsDoc
} from '@infinityxyz/lib/types/core';
import {
  RewardsProgramByEpochDto,
  RewardsProgramDto,
  UserEpochRewardDto,
  UserPhaseRewardDto,
  UserRewardsDto
} from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CurationService } from 'collections/curation/curation.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class RewardsService {
  constructor(protected firebaseService: FirebaseService, protected curationService: CurationService) {}

  async getPrograms(chainId: ChainId): Promise<RewardsProgramByEpochDto | null> {
    const rewardsProgramRef = this.firebaseService.firestore
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(chainId) as FirebaseFirestore.DocumentReference<RewardsProgramDto>;

    const snap = await rewardsProgramRef.get();
    const program = snap.data();
    if (!program) {
      return null;
    }

    const epochs: RewardsProgramByEpochDto = {} as any;
    for (const epoch of Object.values(Epoch)) {
      const rewardEpoch = program.epochs.find((item) => item.name === epoch);
      if (!rewardEpoch) {
        console.warn(`No rewards found for epoch: ${epoch}`);
        epochs[epoch] = {} as any;
      } else {
        epochs[epoch] = rewardEpoch;
      }
    }

    return epochs;
  }

  async getUserRewards(chainId: ChainId, parsedUser: ParsedUserId): Promise<UserRewardsDto | null> {
    const program = await this.getPrograms(chainId);
    if (!program) {
      return null;
    }

    const userRewardRef = parsedUser.ref.collection(firestoreConstants.USER_REWARDS_COLL).doc(chainId);
    const userAllTimeRewards = userRewardRef
      .collection(firestoreConstants.USER_ALL_TIME_REWARDS_COLL)
      .doc(
        firestoreConstants.USER_ALL_TIME_TXN_FEE_REWARDS_DOC
      ) as FirebaseFirestore.DocumentReference<AllTimeTransactionFeeRewardsDoc>;
    const userRewardPhasesRef = userRewardRef.collection(
      firestoreConstants.USER_REWARD_PHASES_COLL
    ) as FirebaseFirestore.CollectionReference<TransactionFeePhaseRewardsDoc>;

    const userPhasesSnap = await userRewardPhasesRef.get();
    const userPhaseRewards = userPhasesSnap.docs.map((item) => item.data());

    const rewards = {} as Record<Epoch, UserEpochRewardDto>;

    for (const e of Object.values(Epoch)) {
      const epoch = program[e];
      if (epoch) {
        const phases: UserPhaseRewardDto[] = epoch.phases.map((phase) => {
          const userPhaseReward = userPhaseRewards.find((item) => item.phase === phase.name);
          return {
            name: phase.name,
            userVolume: userPhaseReward?.volume ?? 0,
            userRewards: userPhaseReward?.rewards ?? 0,
            [RewardProgram.TradingFee]: phase[RewardProgram.TradingFee] ?? null,
            [RewardProgram.NftReward]: phase[RewardProgram.NftReward] ?? null,
            [RewardProgram.Curation]: phase[RewardProgram.Curation],
            userSells: userPhaseReward?.userSells ?? 0,
            userBuys: userPhaseReward?.userBuys ?? 0
          };
        });
        rewards[epoch.name] = {
          name: epoch.name,
          phases
        };
      }
    }

    const userTotalSnap = await userAllTimeRewards.get();
    const userTotalRewards = userTotalSnap.data() ?? null;

    const userCurationTotals = await this.curationService.getUserRewards(parsedUser);

    return {
      chainId,
      epochRewards: rewards,
      totals: {
        userVolume: userTotalRewards?.volume ?? 0,
        userRewards: userTotalRewards?.rewards ?? 0,
        userSells: userTotalRewards?.userSells ?? 0,
        userBuys: userTotalRewards?.userBuys ?? 0,
        userCurationRewardsEth: userCurationTotals.totalProtocolFeesAccruedEth,
        userCurationRewardsWei: userCurationTotals.totalProtocolFeesAccruedWei
      }
    };
  }
}
