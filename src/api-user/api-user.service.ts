import { Injectable } from '@nestjs/common';
import { ApiUserConfigStorageFirebase } from './api-user-config-storage-firebase.service';
import { ApiUser, ApiUserCreds, ApiUserVerifier } from './api-user.types';
import { getHmac } from './api-user.utils';
import { randomBytes } from 'crypto';

@Injectable()
export class ApiUserService implements ApiUserVerifier {
  constructor(private storage: ApiUserConfigStorageFirebase) {}

  async getUser(apiKey: string): Promise<ApiUser | undefined> {
    const data = await this.storage.getUser(apiKey);
    if (data) {
      return data;
    }
    return undefined;
  }

  async verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; user: ApiUser } | { isValid: false; reason: string }> {
    const user = await this.getUser(apiKey);
    if (!user) {
      return { isValid: false, reason: 'Invalid api key or api secret' };
    }
    const hmac = getHmac({ apiKey, apiSecret });
    if (hmac !== user.hmac) {
      return { isValid: false, reason: 'Invalid api key or api secret' };
    }
    return { isValid: true, user };
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
        ...userProps.config
      },
      hmac: creds.hmac
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
        hmac: userProps.hmac,
        createdAt,
        updatedAt
      };

      await this.storage.setUser(user);

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
    const updatedUser: ApiUser = {
      ...currentUser,
      config: {
        ...currentUser.config
      },
      hmac: creds.hmac
    };

    await this.setApiUser({ ...currentUser });

    return {
      user: updatedUser,
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret
    };
  }

  protected generateCreds(user: Pick<ApiUser, 'id'>): ApiUserCreds & { hmac: string } {
    const apiSecret = this.generateId();
    const hmac = getHmac({ apiKey: user.id, apiSecret });

    return { apiKey: user.id, apiSecret, hmac };
  }

  protected generateId() {
    const id = Buffer.from(randomBytes(32)).toString('hex').toLowerCase();
    return id;
  }
}
