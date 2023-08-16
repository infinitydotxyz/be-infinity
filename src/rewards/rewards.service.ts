import { ChainId, DistributionType } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TokenomicsPhaseDto, UserRewardsDto } from '@infinityxyz/lib/types/dto/rewards';
import { ETHEREUM_FLOW_TOKEN_ADDRESS, firestoreConstants, formatEth } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CurationService } from 'collections/curation/curation.service';
import { FirebaseService } from 'firebase/firebase.service';
import { MerkleTreeService } from 'merkle-tree/merkle-tree.service';
import { DailyBuyTotals, GlobalRewards, OverallBuyTotals } from 'types';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { ReferralsService } from 'user/referrals/referrals.service';
import { getZeroHourTimestamp } from 'utils';

@Injectable()
export class RewardsService {
  constructor(
    protected firebaseService: FirebaseService,
    protected curationService: CurationService,
    protected merkleTreeService: MerkleTreeService,
    protected referralsService: ReferralsService
  ) {}

  public NUM_TOKENS_PER_REFERRAL = 2000;

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

  async getGlobalRewards(): Promise<GlobalRewards> {
    const zeroHourTimestampOfTheDay = getZeroHourTimestamp(Date.now());

    const dailyTotalBuyRewardsRef = this.firebaseService.firestore
      .collection('xflBuyRewards')
      .doc(zeroHourTimestampOfTheDay.toString());
    const overallTotalBuyRewardsRef = this.firebaseService.firestore.collection('xflBuyRewards').doc('totals');

    const [dailyTotalBuyRewardsData, overallTotalBuyRewardsData] = await Promise.all([
      dailyTotalBuyRewardsRef.get(),
      overallTotalBuyRewardsRef.get()
    ]);

    const dailyTotalBuyRewards = dailyTotalBuyRewardsData.data() as DailyBuyTotals;
    const dailyTotalVolume = dailyTotalBuyRewards?.dailyTotalVolumeETH ?? 0;
    const dailyTotalNumBuys = dailyTotalBuyRewards?.dailyTotalNumBuys ?? 0;

    const overallTotalBuyRewards = overallTotalBuyRewardsData.data() as OverallBuyTotals;
    const overallTotalVolume = overallTotalBuyRewards?.totalVolumeETH ?? 0;
    const overallTotalNumBuys = overallTotalBuyRewards?.totalNumBuys ?? 0;

    const rewards: GlobalRewards = {
      totalVolumeETH: overallTotalVolume,
      totalNumBuys: overallTotalNumBuys,
      last24HrsVolumeETH: dailyTotalVolume,
      last24HrsNumBuys: dailyTotalNumBuys
    };

    return rewards;
  }

  async getUserRewards(chainId: ChainId, parsedUser: ParsedUserId): Promise<UserRewardsDto> {
    const [XFLConfig] = await Promise.all([this.merkleTreeService.getMerkleRootConfig(chainId, DistributionType.XFL)]);
    const [xflLeaf] = await Promise.all([this.merkleTreeService.getLeaf(XFLConfig, parsedUser.userAddress)]);

    const rewards: UserRewardsDto = {
      chainId,
      totals: {
        totalRewards: {
          claim: {
            contractAddress: ETHEREUM_FLOW_TOKEN_ADDRESS,
            claimedWei: xflLeaf.cumulativeClaimed,
            claimedEth: formatEth(xflLeaf.cumulativeClaimed),
            claimableWei: xflLeaf.claimable,
            claimableEth: formatEth(xflLeaf.claimable),
            account: parsedUser.userAddress,
            cumulativeAmount: xflLeaf.cumulativeAmount,
            merkleRoot: xflLeaf.expectedMerkleRoot,
            merkleProof: xflLeaf.proof
          }
        }
      }
    } as any;

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
