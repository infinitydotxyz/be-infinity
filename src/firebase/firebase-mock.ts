import { MockFactory } from '@nestjs/testing';
import { FirebaseService } from './firebase.service';
import { MockFirestore, MockStorage } from 'firebase-mock';

export const firebaseMockFactory: MockFactory = (token) => {
  // When we add full integration tests, we should use firebase emulator (https://firebase.google.com/docs/rules/unit-tests) or another DB instance specifically for integration tests instead.
  if (token === FirebaseService) {
    const firestore = new MockFirestore();
    const storage = new MockStorage();
    return {
      firestore,
      bucket: storage.bucket()
    } as Pick<FirebaseService, 'firestore' | 'bucket'>;
  }
};
