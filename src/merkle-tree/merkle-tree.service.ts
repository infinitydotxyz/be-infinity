import {
  DistributionType,
  ChainId,
  MerkleRootDoc,
  MerkleRootLeafDoc,
  distributionSourcesByType,
  ETHDistribution,
  INFTDistribution
} from '@infinityxyz/lib/types/core';
import { NULL_HASH } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CmDistributorContractService } from 'ethereum/contracts/cm-distributor.contract.service';
import { FirebaseService } from 'firebase/firebase.service';

@Injectable()
export class MerkleTreeService {
  constructor(protected firebaseService: FirebaseService, protected cmDistributor: CmDistributorContractService) {}

  protected configRef<T extends DistributionType>(
    chainId: ChainId,
    type: T,
    address: string
  ): FirebaseFirestore.DocumentReference<MerkleRootDoc<T>> {
    const docId = `${type}:${chainId}:${address}`;
    const ref = this.firebaseService.firestore
      .collection('merkleRoots')
      .doc(docId) as FirebaseFirestore.DocumentReference<MerkleRootDoc<T>>;
    return ref;
  }

  protected versionedConfigRef<T extends DistributionType>(
    configRef: FirebaseFirestore.DocumentReference<MerkleRootDoc<T>>,
    nonce: number
  ): FirebaseFirestore.DocumentReference<MerkleRootDoc<T>> {
    const ref = configRef.collection('merkleRootVersions').doc(`${nonce}`) as FirebaseFirestore.DocumentReference<
      MerkleRootDoc<T>
    >;
    return ref;
  }

  protected leafRef<T extends DistributionType>(
    versionedConfigRef: FirebaseFirestore.DocumentReference<MerkleRootDoc<T>>,
    userAddress: string
  ) {
    const ref = versionedConfigRef
      .collection('merkleRootVersionLeaves')
      .doc(userAddress) as FirebaseFirestore.DocumentReference<MerkleRootLeafDoc<T>>;
    return ref;
  }

  async getMerkleRootConfig<T extends DistributionType>(chainId: ChainId, type: T): Promise<MerkleRootDoc<T>> {
    const address = this.cmDistributor.getAddress(chainId);
    const configRef = this.configRef(chainId, type, address);
    const configSnap = await configRef.get();

    const config = configSnap.data();

    if (!config) {
      const defaultEthConfig: ETHDistribution = {
        type: DistributionType.ETH,
        chainId,
        stakingContractAddress: '',
        tokenContractAddress: '',
        airdropContractAddress: address,
        maxTimestamp: 0
      };
      const defaultINFTConfig: INFTDistribution = {
        type: DistributionType.INFT,
        chainId,
        tokenContractAddress: '',
        airdropContractAddress: address,
        phaseIds: []
      };

      return {
        config: type === DistributionType.ETH ? defaultEthConfig : defaultINFTConfig,
        updatedAt: 0,
        nonce: -1,
        numEntries: 0,
        root: NULL_HASH,
        totalCumulativeAmount: '0',
        sourceAmounts: this.getDefaultSourceAmountsByType(type)
      };
    }

    return config;
  }

  async getLeaf<T extends DistributionType>(
    merkleRootDoc: MerkleRootDoc<T>,
    userAddress: string
  ): Promise<MerkleRootLeafDoc<T> & { cumulativeClaimed: string; claimable: string }> {
    const defaultLeaf: MerkleRootLeafDoc<T> & { cumulativeClaimed: string; claimable: string } = {
      nonce: merkleRootDoc.nonce,
      address: userAddress,
      cumulativeAmount: '0',
      expectedMerkleRoot: merkleRootDoc.root,
      proof: [],
      leaf: '',
      updatedAt: merkleRootDoc.updatedAt,
      cumulativeClaimed: '0',
      claimable: '0',
      sourcesAmounts: this.getDefaultSourceAmountsByType(merkleRootDoc.config.type)
    };

    if (!merkleRootDoc) {
      return defaultLeaf;
    }

    const configRef = this.configRef(
      merkleRootDoc.config.chainId,
      merkleRootDoc.config.type,
      merkleRootDoc.config.airdropContractAddress
    );
    const nonce = merkleRootDoc.nonce;
    const versionedConfigRef = this.versionedConfigRef(configRef, nonce);
    const leafRef = this.leafRef(versionedConfigRef, userAddress);

    const getCumulativeClaimed = async () => {
      let cumulativeClaimed = '0';
      try {
        if (merkleRootDoc.config.type === DistributionType.ETH) {
          cumulativeClaimed = await this.cmDistributor.getCumulativeETHClaimed(
            merkleRootDoc.config.chainId,
            userAddress
          );
        } else {
          cumulativeClaimed = await this.cmDistributor.getCumulativeINFTClaimed(
            merkleRootDoc.config.chainId,
            userAddress
          );
        }
      } catch (err) {
        console.error(err);
      }
      return cumulativeClaimed;
    };

    const [leafSnap, cumulativeClaimed] = await Promise.all([leafRef.get(), getCumulativeClaimed()]);

    const leafData = leafSnap.data();
    if (!leafData) {
      return defaultLeaf;
    }

    const claimable = BigInt(leafData.cumulativeAmount) - BigInt(cumulativeClaimed);
    return {
      ...leafData,
      cumulativeClaimed,
      claimable: claimable.toString()
    };
  }

  protected getDefaultSourceAmountsByType(type: DistributionType) {
    return Object.values(distributionSourcesByType[type]).reduce((acc, item) => ({ ...acc, [item]: '0' }), {});
  }
}
