import { ChainId } from '@infinityxyz/lib/types/core';
import { firestoreConstants, toLexicographicalStr } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { InvalidNonceError } from 'common/errors/invalid-nonce.error';
import { ContractService } from 'ethereum/contract.service';
import { BigNumber, BigNumberish } from 'ethers';
import { FirebaseService } from 'firebase/firebase.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { UserNonce } from './types';

@Injectable()
export class NonceService {
  constructor(protected _firebaseService: FirebaseService, protected _contractService: ContractService) {}

  public async getNonce(userId: string, chainId: ChainId): Promise<BigNumber> {
    let deprecatedNonce = 0;
    if (chainId === ChainId.Mainnet || chainId === ChainId.Goerli) {
      deprecatedNonce = await this.getDeprecatedNonce(userId);
    }
    const exchange = this._contractService.getExchangeAddress(chainId);
    const userRef = this._firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    const minNonceQuery = userRef
      .collection('userNonces')
      .where('contractAddress', '==', exchange)
      .where('chainId', '==', chainId)
      .orderBy('nonce', 'desc') // nonce is lexicographically sorted
      .limit(1) as FirebaseFirestore.Query<UserNonce>;
    const minUserNonce = await minNonceQuery.get();
    const minNonce = BigNumber.from(minUserNonce.docs[0]?.data?.()?.nonce ?? '0');

    return (minNonce.gt(deprecatedNonce) ? minNonce : BigNumber.from(deprecatedNonce)).add(1);
  }

  public async claimNonce(userId: string, chainId: ChainId, _nonce: BigNumberish): Promise<string> {
    const nonce = BigNumber.from(_nonce);
    const exchange = this._contractService.getExchangeAddress(chainId);
    const userRef = this._firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    const result = await this._firebaseService.firestore.runTransaction(async (txn) => {
      const nonceRef = this.getNonceRef(userRef, nonce, chainId, exchange);
      const deprecatedNonce = await this.getDeprecatedNonce(userId, txn);

      if (nonce.lte(deprecatedNonce)) {
        throw new InvalidNonceError(nonce.toString(), chainId, 'Nonce already claimed');
      }

      const nextNonceDoc = await nonceRef.get();

      if (nextNonceDoc.exists) {
        throw new InvalidNonceError(nonce.toString(), chainId, 'Nonce already claimed');
      }

      const nextNonceData: UserNonce = {
        nonce: this.getFormattedNonce(nonce),
        userAddress: userId,
        contractAddress: exchange,
        fillability: 'fillable',
        chainId
      };

      txn.set(nonceRef, nextNonceData);

      return nextNonceData;
    });

    return result.nonce.toString();
  }

  public async updateNonceFillability(
    userId: string,
    chainId: ChainId,
    nonces: string[],
    fillability: UserNonce['fillability']
  ) {
    const exchange = this._contractService.getExchangeAddress(chainId);
    const userRef = this._firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    const batchHandler = new FirestoreBatchHandler(this._firebaseService);
    for (const nonce of nonces) {
      const userNonce: UserNonce = {
        nonce: this.getFormattedNonce(nonce),
        userAddress: userId,
        chainId,
        contractAddress: exchange,
        fillability
      };

      const ref = this.getNonceRef(userRef, nonce, chainId, exchange);
      await batchHandler.addAsync(ref, userNonce, { merge: true });
    }

    await batchHandler.flush();
  }

  public async getDeprecatedNonce(userId: string, txn?: FirebaseFirestore.Transaction): Promise<number> {
    const userDocRef = this._firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    let userDoc;
    if (txn) {
      userDoc = await txn.get(userDocRef);
    } else {
      userDoc = await userDocRef.get();
    }
    const user = userDoc.data() ?? { address: userId };
    const nonce = parseInt(user.orderNonce ?? 0, 10);

    return nonce;
  }

  protected getNonceRef(
    userRef: FirebaseFirestore.DocumentReference,
    nonce: BigNumberish,
    chainId: ChainId,
    exchange: string
  ) {
    return userRef
      .collection('userNonces')
      .doc(`${nonce.toString()}:${chainId}:${exchange}`) as FirebaseFirestore.DocumentReference<UserNonce>;
  }

  protected getFormattedNonce(nonce: BigNumberish): string {
    return toLexicographicalStr(nonce.toString(), 256);
  }
}
