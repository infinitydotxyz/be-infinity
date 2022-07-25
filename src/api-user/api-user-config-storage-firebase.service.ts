import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user';
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator';
import { instanceToPlain } from 'class-transformer';
import { FirebaseService } from 'firebase/firebase.service';
import { ApiUserStorage } from './api-user-storage.abstract';

@Injectable()
export class ApiUserConfigStorageFirebase extends ApiUserStorage {
  constructor(private firebaseService: FirebaseService) {
    super();
  }

  protected async _getUser(userId: string): Promise<ApiUserDto | null> {
    const userRef = this.getUserRef(userId);
    const userSnap = await userRef.get();
    const user = userSnap.data();
    return user ?? null;
  }

  protected async _setUser(user: ApiUserDto): Promise<ApiUserDto> {
    const userRef = this.getUserRef(user.id);
    const userPlain = instanceToPlain(user);
    await userRef.set(userPlain, { merge: true });
    return user;
  }

  private getUserRef(id: string): FirebaseFirestore.DocumentReference<ApiUserDto | undefined> {
    const user = this.firebaseService.firestore.collection('apiUsers').doc(id) as FirebaseFirestore.DocumentReference<
      ApiUserDto | undefined
    >;
    return user;
  }
}
