import { ChainId } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TokenomicsPhaseDto, UserRewardsDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CurationService } from 'collections/curation/curation.service';
import { ethers } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import { MerkleTreeService } from 'merkle-tree/merkle-tree.service';
import { DailyBuyTotals, GlobalRewards, OverallBuyTotals } from 'types';
import { UserBuyReward } from 'types';
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
    const overallTotalBuyRewardsRef = this.firebaseService.firestore
      .collection('xflBuyRewards')
      .doc('totals');

    const [dailyTotalBuyRewardsData, overallTotalBuyRewardsData] = await Promise.all([dailyTotalBuyRewardsRef.get(), overallTotalBuyRewardsRef.get()]);

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
    const userAddress = parsedUser.userAddress;
    const airdropRef = this.firebaseService.firestore.collection('xflAirdrop').doc(userAddress);

    const zeroHourTimestampOfTheDay = getZeroHourTimestamp(Date.now());
    const dailyUserBuyRewardsRef = this.firebaseService.firestore
      .collection('xflBuyRewards')
      .doc(zeroHourTimestampOfTheDay.toString())
      .collection('buyers')
      .doc(userAddress);
    const totalUserBuyRewardsRef = this.firebaseService.firestore
      .collection('xflBuyRewards')
      .doc('totals')
      .collection('buyers')
      .doc(userAddress);

    const [airdropData, referralTotals, dailyUserBuyRewardsData, totalUserBuyRewardsData] =
      await Promise.all([
        airdropRef.get(),
        this.referralsService.getReferralRewards(parsedUser, chainId),
        dailyUserBuyRewardsRef.get(),
        totalUserBuyRewardsRef.get()
      ]);

    const xflAmountWei = airdropData.get('xflAirdrop') ?? ('0' as string);
    const xflAmountEth = parseFloat(ethers.utils.formatEther(xflAmountWei));
    const isINFT = (airdropData.get('inftBalance') as string) === '0' ? false : true;

    const numReferrals = referralTotals.stats.numReferrals;
    const referralRewardBoost = numReferrals < 10 ? 0 : numReferrals > 200 ? 2 : Math.floor(numReferrals / 10) * 0.1;
    const numReferralTokens = numReferrals * this.NUM_TOKENS_PER_REFERRAL;

    const dailyUserBuyRewards = dailyUserBuyRewardsData.data() as UserBuyReward;
    const dailyUserVolume = dailyUserBuyRewards?.volumeETH ?? 0;

    const totalUserBuyRewards = totalUserBuyRewardsData.data() as UserBuyReward;
    const totalUserVolume = totalUserBuyRewards?.volumeETH ?? 0;
    const totalBuyRewardEarned = totalUserBuyRewards?.finalReward ?? 0;

    const rewards: UserRewardsDto = {
      chainId,
      totals: {
        totalRewards: {
          claim: {
            contractAddress: '',
            claimedWei: '',
            claimedEth: 0,
            claimableWei: '',
            claimableEth: 0,
            account: parsedUser.userAddress,
            cumulativeAmount: '',
            merkleRoot: '',
            merkleProof: []
          }
        },
        airdrop: {
          isINFT,
          cumulative: xflAmountEth
        },
        buyRewards: {
          volLast24Hrs: dailyUserVolume,
          volTotal: totalUserVolume,
          earnedRewardsTotal: totalBuyRewardEarned
        },
        listingRewards: {
          numListings24Hrs: 0,
          numListingsTotal: 0,
          earnedRewardsTotal: 0
        },
        referrals: {
          numReferrals,
          referralLink: referralTotals.referralLink,
          referralRewardBoost,
          numTokens: numReferralTokens
        }
      }
    } as any;

    return rewards;
  }

  // async getUserRewards(chainId: ChainId, parsedUser: ParsedUserId): Promise<UserRewardsDto> {
  //   const userRewardRef = parsedUser.ref.collection(firestoreConstants.USER_REWARDS_COLL).doc(chainId);
  //   const userAllTimeRewards = userRewardRef
  //     .collection(firestoreConstants.USER_ALL_TIME_REWARDS_COLL)
  //     .doc(
  //       firestoreConstants.USER_ALL_TIME_TXN_FEE_REWARDS_DOC
  //     ) as FirebaseFirestore.DocumentReference<AllTimeTransactionFeeRewardsDoc>;

  //   const [INFTConfig, FLURConfig, FLOWConfig, ethConfig, userTotalSnap, userCurationTotals, referralTotals] =
  //     await Promise.all([
  //       this.merkleTreeService.getMerkleRootConfig(chainId, DistributionType.INFT),
  //       this.merkleTreeService.getMerkleRootConfig(chainId, DistributionType.FLUR),
  //       this.merkleTreeService.getMerkleRootConfig(chainId, DistributionType.FLOW),
  //       this.merkleTreeService.getMerkleRootConfig(chainId, DistributionType.ETH),
  //       userAllTimeRewards.get(),
  //       this.curationService.getUserRewards(parsedUser),
  //       this.referralsService.getReferralRewards(parsedUser, chainId)
  //     ]);
  //   const [inftLeaf, flurLeaf, flowLeaf, ethLeaf] = await Promise.all([
  //     this.merkleTreeService.getLeaf(INFTConfig, parsedUser.userAddress),
  //     this.merkleTreeService.getLeaf(FLURConfig, parsedUser.userAddress),
  //     this.merkleTreeService.getLeaf(FLOWConfig, parsedUser.userAddress),
  //     this.merkleTreeService.getLeaf(ethConfig, parsedUser.userAddress)
  //   ]);

  //   const userTotalRewards = userTotalSnap.data() ?? null;

  //   const v1Airdrop = userTotalRewards?.v1Airdrop ?? 0;
  //   const totalUserReward = (userTotalRewards?.rewards ?? 0) + v1Airdrop;

  //   const rewards: UserRewardsDto = {
  //     chainId,
  //     totals: {
  //       flurAirdrop: {
  //         claim: {
  //           contractAddress: FLURConfig.config.airdropContractAddress,
  //           claimedWei: flurLeaf.cumulativeClaimed,
  //           claimedEth: formatEth(flurLeaf.cumulativeClaimed),
  //           claimableWei: flurLeaf.claimable,
  //           claimableEth: formatEth(flurLeaf.claimable),
  //           account: parsedUser.userAddress,
  //           cumulativeAmount: flurLeaf.cumulativeAmount,
  //           merkleRoot: flurLeaf.expectedMerkleRoot,
  //           merkleProof: flurLeaf.proof
  //         }
  //       },
  //       flowRewards: {
  //         claim: {
  //           contractAddress: FLOWConfig.config.airdropContractAddress,
  //           claimedWei: flowLeaf.cumulativeClaimed,
  //           claimedEth: formatEth(flowLeaf.cumulativeClaimed),
  //           claimableWei: flowLeaf.claimable,
  //           claimableEth: formatEth(flowLeaf.claimable),
  //           account: parsedUser.userAddress,
  //           cumulativeAmount: flowLeaf.cumulativeAmount,
  //           merkleRoot: flowLeaf.expectedMerkleRoot,
  //           merkleProof: flowLeaf.proof
  //         }
  //       },
  //       tradingRefund: {
  //         volume: userTotalRewards?.volumeEth ?? 0,
  //         rewards: totalUserReward,
  //         sells: userTotalRewards?.userSells ?? 0,
  //         buys: userTotalRewards?.userBuys ?? 0,
  //         claim: {
  //           contractAddress: INFTConfig.config.airdropContractAddress,
  //           claimedWei: inftLeaf.cumulativeClaimed,
  //           claimedEth: formatEth(inftLeaf.cumulativeClaimed),
  //           claimableWei: inftLeaf.claimable,
  //           claimableEth: formatEth(inftLeaf.claimable),
  //           account: parsedUser.userAddress,
  //           cumulativeAmount: inftLeaf.cumulativeAmount,
  //           merkleRoot: inftLeaf.expectedMerkleRoot,
  //           merkleProof: inftLeaf.proof
  //         }
  //       },
  //       curation: {
  //         totalRewardsWei: userCurationTotals.totalProtocolFeesAccruedWei,
  //         totalRewardsEth: userCurationTotals.totalProtocolFeesAccruedEth,
  //         claim: {
  //           contractAddress: ethConfig.config.airdropContractAddress,
  //           claimedWei: ethLeaf.cumulativeClaimed,
  //           claimedEth: formatEth(ethLeaf.cumulativeClaimed),
  //           claimableWei: ethLeaf.claimable,
  //           claimableEth: formatEth(ethLeaf.claimable),
  //           account: parsedUser.userAddress,
  //           cumulativeAmount: ethLeaf.cumulativeAmount,
  //           merkleRoot: ethLeaf.expectedMerkleRoot,
  //           merkleProof: ethLeaf.proof
  //         }
  //       },
  //       referrals: {
  //         totalRewardsWei: referralTotals.stats.totalFeesGenerated.feesGeneratedWei,
  //         totalRewardsEth: referralTotals.stats.totalFeesGenerated.feesGeneratedEth,
  //         numReferrals: referralTotals.stats.numReferralSales
  //       }
  //     }
  //   } as any;

  //   return rewards;
  // }

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
