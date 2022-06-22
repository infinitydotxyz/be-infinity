import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { FirebaseService } from 'firebase/firebase.service';

@Injectable()
export class CurationService {
  constructor(private firebaseService: FirebaseService) {}

  async vote({
    collection,
    userAddress,
    votes
  }: {
    collection: ParsedCollectionId;
    votes: number;
    userAddress: string;
  }) {
    const incrementVotes = this.firebaseService.firestoreNamespace.FieldValue.increment(votes);

    return Promise.all([
      collection.ref.update('numCuratorVotes', incrementVotes),
      collection.ref
        .collection(firestoreConstants.COLLECTION_CURATORS_COLL)
        .doc(userAddress)
        .set({ votes: incrementVotes })
    ]);
  }
}
