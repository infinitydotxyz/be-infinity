import { ChainId } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import firebaseAdmin from 'firebase-admin';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { FavoriteCollectionDto } from './favorites.dto';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';

@Injectable()
export class FavoritesService {
  private fsBatchHandler: FirestoreBatchHandler;

  constructor(private firebaseService: FirebaseService, private stakerContractService: StakerContractService) {
    this.fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
  }

  private getRootCollectionRef(chainId = ChainId.Mainnet) {
    const stakerContract = this.stakerContractService.getStakerAddress(chainId);
    return this.firebaseService.firestore.collection('favorites').doc(`${chainId}:${stakerContract}`);
  }

  private getCurrentPhaseId() {
    return '1'; // TODO: get current active phase from firestore (CC @Joe) // const ref = db.collection(firestoreConstants.REWARDS_COLL).doc(collection.chainId) as FirebaseFirestore.DocumentReference<TokenomicsConfigDto>;
  }

  /**
   * Submit a favorite collection for a specific user during this phase.
   *
   * @param collection The collection to vote for.
   * @param user The user who is submitting the vote.
   */
  async saveFavorite({ collection: collectionAddress, chainId }: FavoriteCollectionDto, user: ParsedUserId) {
    const phaseId = this.getCurrentPhaseId();

    const rootRef = this.getRootCollectionRef(chainId);

    this.fsBatchHandler.add(
      rootRef.collection('userFavorites').doc(`${user.userAddress}:${phaseId}`),
      {
        chainId: chainId,
        collection: collectionAddress
      } as FavoriteCollectionDto,
      { merge: false }
    );
    this.fsBatchHandler.add(
      rootRef.collection('collectionFavorites').doc(phaseId).collection('collections').doc(collectionAddress),
      {
        totalNumFavorited: firebaseAdmin.firestore.FieldValue.increment(1)
      },
      { merge: false }
    );

    await this.fsBatchHandler.flush();
  }

  /**
   * Returns the current user-favorited collection.
   * @param user
   * @param chainId
   * @returns
   */
  async getFavoriteCollection(user: ParsedUserId, chainId?: ChainId) {
    const phaseId = this.getCurrentPhaseId();
    const docRef = this.getRootCollectionRef(chainId).collection('userFavorites').doc(`${user.userAddress}:${phaseId}`);
    const snap = await docRef.get();
    return snap.exists ? (snap.data() as FavoriteCollectionDto) : null;
  }
}
