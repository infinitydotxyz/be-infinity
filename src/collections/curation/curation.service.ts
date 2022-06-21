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
      collection.ref.update('numCurationVotes', incrementVotes),
      collection.ref.collection('curated').doc(userAddress).set({ votes: incrementVotes })
    ]);
  }
}
