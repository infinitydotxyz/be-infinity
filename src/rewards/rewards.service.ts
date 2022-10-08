import { AllTimeTransactionFeeRewardsDoc, ChainId } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, UserRewardsDto } from '@infinityxyz/lib/types/dto/rewards';
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

    return {
      chainId,
      totals: {
        userVolume: userTotalRewards?.volumeEth ?? 0,
        userRewards: totalUserReward,
        userSells: userTotalRewards?.userSells ?? 0,
        userBuys: userTotalRewards?.userBuys ?? 0,
        userCurationRewardsWei: userCurationTotals.totalProtocolFeesAccruedWei,
        userCurationRewardsEth: userCurationTotals.totalProtocolFeesAccruedEth
      }
    };
  }
}
