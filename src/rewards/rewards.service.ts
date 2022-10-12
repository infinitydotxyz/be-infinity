import { AirdropType, AllTimeTransactionFeeRewardsDoc, ChainId } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TokenomicsPhaseDto, UserRewardsDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CurationService } from 'collections/curation/curation.service';
import { FirebaseService } from 'firebase/firebase.service';
import { MerkleTreeService } from 'merkle-tree/merkle-tree.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class RewardsService {
  constructor(
    protected firebaseService: FirebaseService,
    protected curationService: CurationService,
    protected merkleTreeService: MerkleTreeService
  ) {}

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

    const tradingFeeConfig = await this.merkleTreeService.getMerkleRootConfig(chainId, AirdropType.TxFees);
    const tradingFeeLeaf = await this.merkleTreeService.getLeaf(tradingFeeConfig, parsedUser.userAddress);

    const curationConfig = await this.merkleTreeService.getMerkleRootConfig(chainId, AirdropType.Curation);
    const curationLeaf = await this.merkleTreeService.getLeaf(curationConfig, parsedUser.userAddress);

    const rewards: UserRewardsDto = {
      chainId,
      totals: {
        tradingRefund: {
          volume: userTotalRewards?.volumeEth ?? 0,
          rewards: totalUserReward,
          sells: userTotalRewards?.userSells ?? 0,
          buys: userTotalRewards?.userBuys ?? 0,
          claim: {
            contractAddress: tradingFeeConfig.config.airdropContractAddress,
            claimedWei: tradingFeeLeaf.cumulativeClaimed,
            claimedEth: formatEth(tradingFeeLeaf.cumulativeClaimed),
            claimableWei: tradingFeeLeaf.claimable,
            claimableEth: formatEth(tradingFeeLeaf.claimable),
            account: parsedUser.userAddress,
            cumulativeAmount: tradingFeeLeaf.cumulativeAmount,
            merkleRoot: tradingFeeLeaf.expectedMerkleRoot,
            merkleProof: tradingFeeLeaf.proof
          }
        },
        curation: {
          totalRewardsWei: userCurationTotals.totalProtocolFeesAccruedWei,
          totalRewardsEth: userCurationTotals.totalProtocolFeesAccruedEth,
          claim: {
            contractAddress: curationConfig.config.airdropContractAddress,
            claimedWei: curationLeaf.cumulativeClaimed,
            claimedEth: formatEth(curationLeaf.cumulativeClaimed),
            claimableWei: curationLeaf.claimable,
            claimableEth: formatEth(curationLeaf.claimable),
            account: parsedUser.userAddress,
            cumulativeAmount: curationLeaf.cumulativeAmount,
            merkleRoot: curationLeaf.expectedMerkleRoot,
            merkleProof: curationLeaf.proof
          }
        }
      }
    };

    return rewards;
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
