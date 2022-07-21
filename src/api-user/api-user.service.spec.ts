import { ErrorDescription } from '@ethersproject/abi/lib/interface';
import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiUserConfigStorageFirebase } from './api-user-config-storage-firebase.service';
import { ApiUserService } from './api-user.service';
import { getHmac } from './api-user.utils';
class MockApiUserStorage {
  private storage: { [key: string]: ApiUserDto } = {};

  public getUser(userId: string): Promise<ApiUserDto | undefined> {
    return new Promise<ApiUserDto | undefined>((resolve) => {
      const user = this.storage[userId];
      resolve(user);
    });
  }

  public setUser(user: ApiUserDto): Promise<void> {
    return new Promise<void>((resolve) => {
      this.storage[user.id] = user;
      resolve();
    });
  }
}

describe('ApiUserService', () => {
  let apiUserService: ApiUserService;

  beforeEach(async () => {
    const mockStorage = new MockApiUserStorage();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiUserService, ApiUserConfigStorageFirebase]
    })
      .overrideProvider(ApiUserConfigStorageFirebase)
      .useValue(mockStorage)
      .compile();

    apiUserService = module.get<ApiUserService>(ApiUserService);
  });

  it('should be defined', () => {
    expect(apiUserService).toBeDefined();
  });

  it("should not find a user that doesn't exist", async () => {
    try {
      const user = await apiUserService.getUser('asdf');
      expect(user).toBeUndefined();
    } catch (err) {
      expect(true).toBeFalsy();
    }
  });

  it('should create a user', async () => {
    try {
      const response = await apiUserService.createApiUser({
        name: 'test',
        config: {
          global: {
            limit: 10,
            ttl: 60
          },
          role: ApiRole.User
        }
      });
      expect(response.apiKey).toBeDefined();
      expect(response.apiSecret).toBeDefined();
      expect(response.user.name).toBe('test');
      expect(response.user.id).toBeDefined();
    } catch (err) {
      expect(true).toBeFalsy();
    }
  });

  it('should should set the user id to their api key', async () => {
    try {
      const response = await apiUserService.createApiUser({
        name: 'test',
        config: {
          global: {
            limit: 10,
            ttl: 60
          },
          role: ApiRole.User
        }
      });
      expect(response.apiKey).toBe(response.user.id);
    } catch (err) {
      expect(true).toBeFalsy();
    }
  });

  it('should get a user', async () => {
    const response = await apiUserService.createApiUser({
      name: 'test 2',
      config: {
        global: {
          limit: 10,
          ttl: 60
        },
        role: ApiRole.User
      }
    });

    const user = await apiUserService.getUser(response.user.id);

    const hmac = getHmac({ apiKey: response.apiKey, apiSecret: response.apiSecret });

    expect(user).toBeDefined();
    expect(user?.hmac).toBe(hmac);
    expect(response.user.id).toBe(user?.id);
  });

  it('should verify a user', async () => {
    const { user, apiKey, apiSecret } = await apiUserService.createApiUser({
      name: 'verify',
      config: {
        global: {
          limit: 10,
          ttl: 60
        },
        role: ApiRole.User
      }
    });

    const invalidResponse = await apiUserService.verifyAndGetUserConfig(apiKey.slice(1), apiSecret);
    if (!invalidResponse.isValid) {
      expect(invalidResponse.isValid).toBe(false);
      expect(invalidResponse.reason).toBeDefined();
    } else {
      expect(invalidResponse.isValid).toBe(false);
    }

    const validResponse = await apiUserService.verifyAndGetUserConfig(apiKey, apiSecret);
    if (validResponse.isValid) {
      expect(validResponse.isValid).toBe(true);
      expect(validResponse.user).toBeDefined();
      expect(validResponse.user).toBe(user);
    } else {
      expect(validResponse.isValid).toBe(true);
    }
  });

  it('should reset the api secret', async () => {
    const { user, apiKey, apiSecret } = await apiUserService.createApiUser({
      name: 'verify',
      config: {
        global: {
          limit: 10,
          ttl: 60
        },
        role: ApiRole.User
      }
    });

    const res = await apiUserService.resetApiSecret(apiKey);
    if (!res) {
      expect(res).toBeTruthy();
      throw new Error('Failed to reset api secret');
    }

    const { user: updatedUser, apiKey: updatedApiKey, apiSecret: updatedApiSecret } = res;

    /**
     * api key should remain the same
     */
    expect(user.id).toBe(updatedUser.id);
    expect(apiKey).toBe(updatedApiKey);
    expect(user.id).toBe(updatedApiKey);

    /**
     * api secret and hmac should be updated
     */
    expect(apiSecret).not.toBe(updatedApiSecret);
    expect(updatedUser.hmac).not.toBe(user.hmac);
    expect(getHmac({ apiKey, apiSecret })).toBe(user.hmac);
    expect(getHmac({ apiKey: updatedApiKey, apiSecret: updatedApiSecret })).toBe(updatedUser.hmac);
  });
});
