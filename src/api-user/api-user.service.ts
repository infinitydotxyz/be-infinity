import { Injectable } from '@nestjs/common';
import { ApiUserConfigStorageFirebase } from './api-user-config-storage-firebase.service';
import { ApiUserVerifier } from './api-user.types';
import { getHmac } from './api-user.utils';
import { randomBytes } from 'crypto';
import { ApiUserCredsDto, ApiUserDto } from './dto/api-user.dto';

@Injectable()
export class ApiUserService implements ApiUserVerifier {
  constructor(private storage: ApiUserConfigStorageFirebase) {}

  async getUser(apiKey: string): Promise<ApiUserDto | undefined> {
    const data = await this.storage.getUser(apiKey);
    if (data) {
      return data;
    }
    return undefined;
  }

  async verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; user: ApiUserDto } | { isValid: false; reason: string }> {
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
    userProps: Pick<ApiUserDto, 'name' | 'config'>
  ): Promise<{ user: ApiUserDto; apiKey: string; apiSecret: string }> {
    const id = this.generateId();
    const creds = this.generateCreds({ id });
    const userToCreate: Omit<ApiUserDto, 'createdAt' | 'updatedAt'> = {
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

  async setApiUser(userProps: Omit<ApiUserDto, 'createdAt' | 'updatedAt'>): Promise<ApiUserDto> {
    try {
      const currentUser = await this.getUser(userProps.id);
      const createdAt = currentUser?.createdAt ?? Date.now();
      const updatedAt = Date.now();

      const user: ApiUserDto = {
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

  async resetApiSecret(id: string): Promise<{ user: ApiUserDto; apiKey: string; apiSecret: string }> {
    const currentUser = await this.getUser(id);

    if (!currentUser) {
      throw new Error(`User ${id} not found`);
    }

    const creds = this.generateCreds({ id });
    const updatedUser: ApiUserDto = {
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

  protected generateCreds(user: Pick<ApiUserDto, 'id'>): ApiUserCredsDto & { hmac: string } {
    const apiSecret = this.generateId();
    const hmac = getHmac({ apiKey: user.id, apiSecret });

    return { apiKey: user.id, apiSecret, hmac };
  }

  protected generateId() {
    const id = Buffer.from(randomBytes(32)).toString('hex').toLowerCase();
    return id;
  }
}
