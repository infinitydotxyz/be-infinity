import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { ApiUserStorage } from 'api-user/api-user-config-storage.interface';
import { ApiUserService } from 'api-user/api-user.service';
import { API_KEY_HEADER, API_SECRET_HEADER } from 'auth/auth.constants';
import { AuthException } from 'auth/auth.exception';
import { THROTTLER_OPTIONS } from './throttler.constants';
import { ApiKeyThrottlerGuard } from './throttler.guard';

class ThrottlerStorageServiceMock implements ThrottlerStorage {
  private _storage: Record<string, number[]> = {};
  get storage(): Record<string, number[]> {
    return this._storage;
  }

  getRecord(key: string): Promise<number[]> {
    return Promise.resolve(this.storage[key] || []);
  }

  addRecord(key: string, ttl: number): Promise<void> {
    const ttlMilliseconds = ttl * 1000;
    if (!this.storage[key]) {
      this.storage[key] = [];
    }

    this.storage[key].push(Date.now() + ttlMilliseconds);
    return Promise.resolve();
  }
}

class MockApiUserStorage implements ApiUserStorage {
  private storage: { [key: string]: ApiUserDto } = {};

  public getUser(userId: string): Promise<ApiUserDto | undefined> {
    const user = this.storage[userId];
    return Promise.resolve(user);
  }

  public setUser(user: ApiUserDto): Promise<void> {
    this.storage[user.id] = user;
    return Promise.resolve();
  }
}

function contextMockFactory(
  type: 'http' | 'ws' | 'graphql',
  handler: () => any,
  mockFunc: Record<string, any>
): ExecutionContext {
  const executionPartial: Partial<ExecutionContext> = {
    getClass: () => ThrottlerStorageServiceMock as any,
    getHandler: () => handler,
    switchToRpc: () => ({
      getContext: () => ({} as any),
      getData: () => ({} as any)
    }),
    getArgs: () => [] as any,
    getArgByIndex: () => ({} as any),
    getType: () => type as any
  };
  switch (type) {
    case 'ws':
      executionPartial.switchToHttp = () => ({} as any);
      executionPartial.switchToWs = () => mockFunc as any;
      break;
    case 'http':
      executionPartial.switchToWs = () => ({} as any);
      executionPartial.switchToHttp = () => mockFunc as any;
      break;
    case 'graphql':
      executionPartial.switchToWs = () => ({} as any);
      executionPartial.switchToHttp = () =>
        ({
          getNext: () => ({} as any)
        } as any);
      executionPartial.getArgByIndex = () => mockFunc as any;
      break;
  }
  return executionPartial as ExecutionContext;
}

describe('ThrottlerGuard', () => {
  let guard: ApiKeyThrottlerGuard;
  let reflector: Reflector;
  let service: ThrottlerStorageServiceMock;
  let handler: () => any;
  let apiUserStorage: ApiUserStorage;
  let apiUserService: ApiUserService;
  const limit = 5;

  beforeEach(async () => {
    apiUserStorage = new MockApiUserStorage();
    apiUserService = new ApiUserService(apiUserStorage as any);
    service = new ThrottlerStorageServiceMock();
    reflector = {
      getAllAndOverride: jest.fn()
    } as any;
    const options = {
      limit,
      ttl: 60,
      ignoreUserAgents: [/userAgentIgnore/]
    };

    const modRef = await Test.createTestingModule({
      providers: [
        {
          provide: ApiKeyThrottlerGuard,
          useValue: new ApiKeyThrottlerGuard(options, service, reflector, apiUserService)
        },
        {
          provide: THROTTLER_OPTIONS,
          useValue: options
        },
        {
          provide: ThrottlerStorage,
          useValue: service
        },
        {
          provide: Reflector,
          useValue: reflector
        }
      ]
    }).compile();
    guard = modRef.get(ApiKeyThrottlerGuard);
    reflector = modRef.get(Reflector);
    service = modRef.get<ThrottlerStorageServiceMock>(ThrottlerStorage);
  });

  it('should have all of the providers defined', () => {
    expect(guard).toBeDefined();
    expect(reflector).toBeDefined();
    expect(service).toBeDefined();
    expect(apiUserStorage).toBeDefined();
    expect(apiUserService).toBeDefined();
  });

  describe('HTTP Context', () => {
    let reqMock: { headers: jest.Mock<any, any>; ip: string };
    let resMock: { header: jest.Mock<any, any> };
    let headerSettingMock: jest.Mock;

    beforeEach(() => {
      headerSettingMock = jest.fn();
      resMock = {
        header: headerSettingMock
      };
      reqMock = {
        ip: '127.0.0.1',
        headers: {} as any
      };
    });
    afterEach(() => {
      headerSettingMock.mockClear();
    });

    it('should add headers to the res', async () => {
      handler = function addHeaders() {
        return 'string';
      };
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock
      });
      const canActivate = await guard.canActivate(ctxMock);
      expect(canActivate).toBe(true);
      expect(headerSettingMock).toBeCalledTimes(3);
      expect(headerSettingMock).toHaveBeenNthCalledWith(1, 'X-RateLimit-Limit', 5);
      expect(headerSettingMock).toHaveBeenNthCalledWith(2, 'X-RateLimit-Remaining', 4);
      expect(headerSettingMock).toHaveBeenNthCalledWith(3, 'X-RateLimit-Reset', expect.any(Number));
    });

    it('should return an error after passing the limit', async () => {
      handler = function returnError() {
        return 'string';
      };
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock
      });
      for (let i = 0; i < limit; i++) {
        await guard.canActivate(ctxMock);
      }
      await expect(guard.canActivate(ctxMock)).rejects.toThrowError(ThrottlerException);
      expect(headerSettingMock).toBeCalledTimes(16);
      expect(headerSettingMock).toHaveBeenLastCalledWith('Retry-After', expect.any(Number));
    });

    it('should pull values from the reflector instead of options', async () => {
      handler = function useReflector() {
        return 'string';
      };
      reflector.getAllAndOverride = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(2);
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock
      });
      const canActivate = await guard.canActivate(ctxMock);
      expect(canActivate).toBe(true);
      expect(headerSettingMock).toBeCalledTimes(3);
      expect(headerSettingMock).toHaveBeenNthCalledWith(1, 'X-RateLimit-Limit', 2);
      expect(headerSettingMock).toHaveBeenNthCalledWith(2, 'X-RateLimit-Remaining', 1);
      expect(headerSettingMock).toHaveBeenNthCalledWith(3, 'X-RateLimit-Reset', expect.any(Number));
    });
  });

  describe('Api key', () => {
    let reqMock: { headers: Record<string, string>; ip: string };
    let resMock: { header: jest.Mock<any, any> };
    let headerSettingMock: jest.Mock;

    let user: ApiUserDto;

    beforeEach(async () => {
      const {
        apiKey,
        apiSecret,
        user: createdUser
      } = await apiUserService.createApiUser({
        name: 'test',
        config: { role: ApiRole.User, global: { limit: limit * 2, ttl: 60 } }
      });
      user = createdUser;

      const authHeaders = {
        [API_KEY_HEADER]: apiKey,
        [API_SECRET_HEADER]: apiSecret
      };

      headerSettingMock = jest.fn();
      resMock = {
        header: headerSettingMock
      };
      reqMock = {
        ip: '127.0.0.1',
        headers: {
          ...authHeaders
        } as any
      };
    });
    afterEach(() => {
      headerSettingMock.mockClear();
    });

    it('should return an error after passing the user limit', async () => {
      handler = function returnError() {
        return 'string';
      };
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock
      });

      if (!user.config.global.limit) {
        expect(user.config.global.limit).toBeDefined();
        throw new Error('User limit not set');
      }

      for (let i = 0; i < user.config.global.limit; i++) {
        await guard.canActivate(ctxMock);
      }
      await expect(guard.canActivate(ctxMock)).rejects.toThrowError(ThrottlerException);
      expect(headerSettingMock).toBeCalledTimes(3 * user.config.global.limit + 1);
      expect(headerSettingMock).toHaveBeenLastCalledWith('Retry-After', expect.any(Number));
    });

    it('should throw an error for an invalid api key or api secret', async () => {
      handler = function returnError() {
        return 'string';
      };
      const ctxMockInvalidApiKey = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => ({
          ...reqMock,
          headers: {
            ...reqMock.headers,
            [API_KEY_HEADER]: 'invalid'
          }
        })
      });

      await expect(guard.canActivate(ctxMockInvalidApiKey)).rejects.toThrowError(AuthException);

      const ctxMockInvalidSecret = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => ({
          ...reqMock,
          headers: {
            ...reqMock.headers,
            [API_SECRET_HEADER]: 'invalid'
          }
        })
      });

      await expect(guard.canActivate(ctxMockInvalidSecret)).rejects.toThrowError(AuthException);
    });
  });
});
