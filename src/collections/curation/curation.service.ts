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
    return Promise.all([
      collection.ref.update('numVotes', this.firebaseService.firestoreNamespace.FieldValue.increment(votes)),
      collection.ref.collection('votes').doc(userAddress).set({ votes })
    ]);
  }
}
