import { Injectable } from '@nestjs/common';
import { ApiUserConfigStorageFirebase } from './api-user-config-storage-firebase.service';
import { ApiUserVerifier } from './api-user.types';
import { getHmac } from './api-user.utils';
import {
  ApiUserDto,
  AdminUpdateApiUserDto,
  ApiUserWithCredsDto,
  PartialAdminUpdateApiUserDto,
  ApiUserCredsDto
} from '@infinityxyz/lib/types/dto/api-user';
import { generateUUID } from 'utils';

@Injectable()
export class ApiUserService implements ApiUserVerifier {
  constructor(private storage: ApiUserConfigStorageFirebase) {}

  async getUser(apiKey: string): Promise<ApiUserDto | null> {
    const user = await this.storage.getUser(apiKey);
    return user;
  }

  async verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; user: ApiUserDto } | { isValid: false; reason: string }> {
    const user = await this.getUser(apiKey);
    if (!user) {
      return { isValid: false, reason: 'User not found' };
    }
    const hmac = getHmac({ apiKey, apiSecret });
    if (hmac !== user.hmac) {
      return { isValid: false, reason: 'Invalid api key or api secret' };
    }
    return { isValid: true, user };
  }

  async createApiUser(userProps: AdminUpdateApiUserDto): Promise<ApiUserWithCredsDto> {
    let existingUser: ApiUserDto | null;
    let attempts = 0;
    let id: string;
    do {
      id = this.generateId();
      existingUser = await this.getUser(id);
      attempts += 1;
      if (existingUser && attempts > 10) {
        throw new Error('Failed to create user');
      }
    } while (existingUser);

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

  async updateApiUser(userId: string, userProps: PartialAdminUpdateApiUserDto): Promise<ApiUserDto | null> {
    const currentUser = await this.getUser(userId);
    if (!currentUser) {
      return null;
    }

    const user: ApiUserDto = {
      ...currentUser,
      name: userProps.name || currentUser.name,
      config: userProps.config || currentUser.config
    };
    return await this.setApiUser(user);
  }

  async resetApiSecret(id: string): Promise<ApiUserWithCredsDto | null> {
    const currentUser = await this.getUser(id);

    if (!currentUser) {
      return null;
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

  protected async setApiUser({
    id,
    name,
    config,
    hmac
  }: Omit<ApiUserDto, 'createdAt' | 'updatedAt'>): Promise<ApiUserDto> {
    try {
      const currentUser = await this.getUser(id);
      const createdAt = currentUser?.createdAt ?? Date.now();
      const updatedAt = Date.now();

      const user: ApiUserDto = {
        id,
        name,
        config,
        hmac,
        createdAt,
        updatedAt
      };

      await this.storage.setUser(user);

      return user;
    } catch (err) {
      console.error(`Failed to update api user: ${id}`, err);
      throw err;
    }
  }

  protected generateCreds(user: Pick<ApiUserDto, 'id'>): ApiUserCredsDto & { hmac: string } {
    const apiSecret = this.generateId();
    const hmac = getHmac({ apiKey: user.id, apiSecret });

    return { apiKey: user.id, apiSecret, hmac };
  }

  protected generateId() {
    return generateUUID();
  }
}
