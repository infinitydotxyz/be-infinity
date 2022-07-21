import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator';
import { FirebaseService } from 'firebase/firebase.service';
import { ApiUserStorage } from './api-user-config-storage.interface';
import { ApiUserDto } from './dto/api-user.dto';

@Injectable()
export class ApiUserConfigStorageFirebase implements ApiUserStorage {
  constructor(private firebaseService: FirebaseService) {}

  protected getUserRef(id: string): FirebaseFirestore.DocumentReference<ApiUserDto | undefined> {
    const user = this.firebaseService.firestore.collection('apiUsers').doc(id) as FirebaseFirestore.DocumentReference<
      ApiUserDto | undefined
    >;
    return user;
  }

  async getUser(userId: string): Promise<ApiUserDto | undefined> {
    const userRef = this.getUserRef(userId);
    const userSnap = await userRef.get();
    const user = userSnap.data();
    if (user) {
      return user;
    }
    return undefined;
  }

  async setUser(user: ApiUserDto): Promise<void> {
    const userRef = this.getUserRef(user.id);
    await userRef.set(user, { merge: true });
  }
}
