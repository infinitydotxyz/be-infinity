import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { ApiUserConfigStorageRedisService } from './api-user-config-storage.service';
import { ApiUser, ApiUserConfig, ApiUserCreds } from './api-user.types';
import { getHmac } from './api-user.utils';

@Injectable()
export class ApiUserService {
  constructor(private firestoreService: FirebaseService, private configStorage: ApiUserConfigStorageRedisService) {}

  async getUser(id: string): Promise<ApiUser | undefined> {
    const user = await this.getUserRef(id).get();
    const data = user.data();
    if (data) {
      return data;
    }
    return undefined;
  }

  async verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; userConfig: ApiUserConfig } | { isValid: false; reason: string }> {
    const userConfig = await this.configStorage.getUser(apiKey);
    if (!userConfig) {
      return { isValid: false, reason: 'Invalid api key or api secret' };
    }
    const hmac = getHmac({ apiKey, apiSecret });
    if (hmac !== userConfig.hmac) {
      return { isValid: false, reason: 'Invalid api key or api secret' };
    }
    return { isValid: true, userConfig };
  }

  async createApiUser(
    userProps: Pick<ApiUser, 'name' | 'config'>
  ): Promise<{ user: ApiUser; apiKey: string; apiSecret: string }> {
    const id = this.generateId();
    const creds = this.generateCreds({ id });
    const userToCreate: Omit<ApiUser, 'createdAt' | 'updatedAt'> = {
      id,
      name: userProps.name,
      config: {
        ...userProps.config,
        hmac: creds.hmac
      }
    };
    const user = await this.setApiUser(userToCreate);
    return {
      user,
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret
    };
  }

  async setApiUser(userProps: Omit<ApiUser, 'createdAt' | 'updatedAt'>): Promise<ApiUser> {
    try {
      const currentUser = await this.getUser(userProps.id);
      const createdAt = currentUser?.createdAt ?? Date.now();
      const updatedAt = Date.now();

      const user: ApiUser = {
        id: userProps.id,
        name: userProps.name,
        config: userProps.config,
        createdAt,
        updatedAt
      };

      await this.configStorage.setUser(userProps.id, userProps.config);
      await this.getUserRef(user.id).set({ ...user }, { merge: true });
      return user;
    } catch (err) {
      console.error(`Failed to update api user: ${userProps.id}`, err);
      throw err;
    }
  }

  async resetApiSecret(id: string): Promise<{ user: ApiUser; apiKey: string; apiSecret: string }> {
    const currentUser = await this.getUser(id);

    if (!currentUser) {
      throw new Error(`User ${id} not found`);
    }

    const creds = this.generateCreds({ id });
    const updatedUser = {
      ...currentUser,
      config: {
        ...currentUser.config,
        hmac: creds.hmac
      }
    };

    await this.setApiUser({ ...currentUser });

    return {
      user: updatedUser,
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret
    };
  }

  protected getUserRef(id: string): FirebaseFirestore.DocumentReference<ApiUser | undefined> {
    const user = this.firestoreService.firestore.collection('api-users').doc(id) as FirebaseFirestore.DocumentReference<
      ApiUser | undefined
    >;
    return user;
  }

  protected generateCreds(user: Pick<ApiUser, 'id'>): ApiUserCreds & { hmac: string } {
    const apiSecret = this.generateId();
    const hmac = getHmac({ apiKey: user.id, apiSecret });

    return { apiKey: user.id, apiSecret, hmac };
  }

  protected generateId() {
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
      .toString('base64')
      .toLowerCase();
    return id;
  }
}
