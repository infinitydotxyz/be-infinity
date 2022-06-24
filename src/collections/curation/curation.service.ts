import { CuratedCollection } from '@infinityxyz/lib/types/core/CuratedCollection';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class CurationService {
  constructor(private firebaseService: FirebaseService) {}

  async vote({ collection, user, votes }: { collection: ParsedCollectionId; user: ParsedUserId; votes: number }) {
    const incrementVotes = this.firebaseService.firestoreNamespace.FieldValue.increment(votes);

    const batch = this.firebaseService.firestore.batch();

    batch.set(collection.ref, { numCuratorVotes: incrementVotes as any }, { merge: true });
    batch.set(
      collection.ref.collection(firestoreConstants.COLLECTION_CURATORS_COLL).doc(user.ref.id),
      {
        votes: incrementVotes,
        userAddress: user.userAddress,
        userChainId: user.userChainId,
        collectionAddress: collection.address,
        collectionChainId: collection.chainId
      },
      { merge: true }
    );

    return batch.commit();
  }

  /**
   * Find a specific user-curated collection.
   */
  async findUserCurated(
    user: Omit<ParsedUserId, 'ref'>,
    collection: Omit<ParsedCollectionId, 'ref'>
  ): Promise<CuratedCollection | null> {
    const snap = await this.firebaseService.firestore
      .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
      .where('userAddress', '==', user.userAddress)
      .where('userChainId', '==', user.userChainId)
      .where('collectionAddress', '==', collection.address)
      .where('collectionChainId', '==', collection.chainId)
      .limit(1)
      .get();

    const doc = snap.docs[0];

    if (!doc?.exists) {
      return null;
    }

    return doc.data() as CuratedCollection;
  }
}
