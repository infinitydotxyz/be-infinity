import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';

@Injectable()
export class AuthService {
  constructor(private firebaseService: FirebaseService) {}

  public async saveUserNonce(user: string, nonce: number) {
    await this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(user).set(
      {
        loginNonce: nonce,
        loginNonceTimestamp: Date.now()
      },
      { merge: true }
    );
  }
}
