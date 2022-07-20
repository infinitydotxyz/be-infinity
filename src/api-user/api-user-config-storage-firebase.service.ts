import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator';
import { FirebaseService } from 'firebase/firebase.service';
import { ApiUserStorage } from './api-user-config-storage.interface';
import { ApiUser } from './api-user.types';

@Injectable()
export class ApiUserConfigStorageFirebase implements ApiUserStorage {
  constructor(private firebaseService: FirebaseService) {}

  protected getUserRef(id: string): FirebaseFirestore.DocumentReference<ApiUser | undefined> {
    const user = this.firebaseService.firestore.collection('api-users').doc(id) as FirebaseFirestore.DocumentReference<
      ApiUser | undefined
    >;
    return user;
  }

  async getUser(userId: string): Promise<ApiUser | undefined> {
    const userRef = this.getUserRef(userId);
    const userSnap = await userRef.get();
    const user = userSnap.data();
    if (user) {
      return user;
    }
    return undefined;
  }

  async setUser(user: ApiUser): Promise<void> {
    const userRef = this.getUserRef(user.id);
    await userRef.set(user, { merge: true });
  }
}
