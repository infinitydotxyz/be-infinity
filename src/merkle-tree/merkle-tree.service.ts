import { AirdropType, ChainId, MerkleRootDoc, MerkleRootLeafDoc } from '@infinityxyz/lib/types/core';
import { NULL_HASH } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { CmDistributorContractService } from 'ethereum/contracts/cm-distributor.contract.service';
import { FirebaseService } from 'firebase/firebase.service';

@Injectable()
export class MerkleTreeService {
  constructor(protected firebaseService: FirebaseService, protected cmDistributor: CmDistributorContractService) {}

  protected configRef(
    chainId: ChainId,
    type: AirdropType,
    address: string
  ): FirebaseFirestore.DocumentReference<MerkleRootDoc> {
    const docId = `${type}:${chainId}:${address}`;
    const ref = this.firebaseService.firestore
      .collection('merkleRoots')
      .doc(docId) as FirebaseFirestore.DocumentReference<MerkleRootDoc>;
    return ref;
  }

  protected versionedConfigRef(
    configRef: FirebaseFirestore.DocumentReference<MerkleRootDoc>,
    nonce: number
  ): FirebaseFirestore.DocumentReference<MerkleRootDoc> {
    const ref = configRef
      .collection('merkleRootVersions')
      .doc(`${nonce}`) as FirebaseFirestore.DocumentReference<MerkleRootDoc>;
    return ref;
  }

  protected leafRef(versionedConfigRef: FirebaseFirestore.DocumentReference<MerkleRootDoc>, userAddress: string) {
    const ref = versionedConfigRef
      .collection('merkleRootVersionLeaves')
      .doc(userAddress) as FirebaseFirestore.DocumentReference<MerkleRootLeafDoc>;
    return ref;
  }

  async getMerkleRootConfig(chainId: ChainId, type: AirdropType): Promise<MerkleRootDoc> {
    const address = this.cmDistributor.getAddress(chainId);
    const configRef = this.configRef(chainId, type, address);
    const configSnap = await configRef.get();

    const config = configSnap.data();

    if (!config) {
      const defaultConfig =
        type === AirdropType.Curation
          ? {
              type,
              chainId,
              stakingContractAddress: '',
              tokenContractAddress: '',
              airdropContractAddress: address,
              maxTimestamp: 0
            }
          : {
              type,
              chainId,
              tokenContractAddress: '',
              airdropContractAddress: address,
              phaseIds: []
            };
      return {
        config: defaultConfig,
        updatedAt: 0,
        nonce: -1,
        numEntries: 0,
        root: NULL_HASH,
        totalCumulativeAmount: '0'
      };
    }

    return config;
  }

  async getLeaf(
    merkleRootDoc: MerkleRootDoc,
    userAddress: string
  ): Promise<MerkleRootLeafDoc & { cumulativeClaimed: string; claimable: string }> {
    const defaultLeaf: MerkleRootLeafDoc & { cumulativeClaimed: string; claimable: string } = {
      nonce: merkleRootDoc.nonce,
      address: userAddress,
      cumulativeAmount: '0',
      expectedMerkleRoot: merkleRootDoc.root,
      proof: [],
      leaf: '',
      updatedAt: merkleRootDoc.updatedAt,
      cumulativeClaimed: '0',
      claimable: '0'
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

    const leafSnap = await leafRef.get();
    const leafData = leafSnap.data();

    let cumulativeClaimed = '0';
    if (merkleRootDoc.config.type === AirdropType.Curation) {
      cumulativeClaimed = await this.cmDistributor.getCumulativeETHClaimed(merkleRootDoc.config.chainId, userAddress);
    } else {
      cumulativeClaimed = await this.cmDistributor.getCumulativeINFTClaimed(merkleRootDoc.config.chainId, userAddress);
    }

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
}
