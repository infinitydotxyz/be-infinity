import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiUserStorage } from 'api-user/api-user-config-storage.interface';
import { ApiUserService } from 'api-user/api-user.service';
import { ApiUser } from 'api-user/api-user.types';
import { ethers } from 'ethers';
import { splitSignature } from 'ethers/lib/utils';
import { UserParserService } from 'user/parser/parser.service';
import { base64Encode } from 'utils';
import {
  ApiRole,
  API_KEY_HEADER,
  API_SECRET_HEADER,
  AUTH_MESSAGE_HEADER,
  AUTH_NONCE_HEADER,
  AUTH_SIGNATURE_HEADER,
  SiteRole
} from './auth.constants';
import { AuthException } from './auth.exception';
import { AuthGuard } from './auth.guard';

class Dummy {}

const userService = {
  getRef: (address: string) => {
    return {} as any;
  }
};
class MockUserParser extends UserParserService {
  constructor() {
    super(userService as any);
  }

  parse(value: string) {
    return Promise.resolve(this._parse(value));
  }

  private _parse(value: string) {
    // address
    if (ethers.utils.isAddress(value)) {
      return this.parseAddress(value);
    }

    // chain:address
    return this.parseChainAddress(value);
  }
}
class MockApiUserStorage implements ApiUserStorage {
  private storage: { [key: string]: ApiUser } = {};

  public getUser(userId: string): Promise<ApiUser | undefined> {
    const user = this.storage[userId];
    return Promise.resolve(user);
  }

  public setUser(user: ApiUser): Promise<void> {
    this.storage[user.id] = user;
    return Promise.resolve();
  }
}

export async function getAuthHeaders(signer: ethers.Wallet) {
  const nonce = Date.now();
  const msg = `Welcome to Infinity. Click "Sign" to sign in. No password needed. This request will not trigger a blockchain transaction or cost any gas fees.
 
I accept the Infinity Terms of Service: https://infinity.xyz/terms

Nonce: ${nonce}
Expires in: 24 hrs`;

  const res = await signer.signMessage(msg);
  const sig = splitSignature(res);
  return {
    [AUTH_NONCE_HEADER]: nonce.toString(),
    [AUTH_SIGNATURE_HEADER]: JSON.stringify(sig),
    [AUTH_MESSAGE_HEADER]: base64Encode(msg)
  };
}

function contextMockFactory(
  type: 'http' | 'ws' | 'graphql',
  handler: () => any,
  mockFunc: Record<string, any>
): ExecutionContext {
  const executionPartial: Partial<ExecutionContext> = {
    getClass: () => Dummy as any,
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

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let handler: () => any;
  let apiUserStorage: ApiUserStorage;
  let apiUserService: ApiUserService;
  const wallet = ethers.Wallet.createRandom();
  const users: Record<
    ApiRole,
    Record<
      SiteRole,
      { user: ApiUser; apiKey: string; apiSecret: string; wallet: ethers.Wallet; apiRole: ApiRole; siteRole: SiteRole }
    >
  > = {} as any;
  async function getUser(apiRole: ApiRole, siteRole: SiteRole) {
    const user = users[apiRole][siteRole];
    const siteAuthHeaders = await getAuthHeaders(user.wallet);
    const apiAuthHeaders = {
      [API_KEY_HEADER]: user.apiKey,
      [API_SECRET_HEADER]: user.apiSecret
    };

    return {
      ...user,
      siteAuthHeaders,
      apiAuthHeaders
    };
  }

  beforeAll(async () => {
    apiUserStorage = new MockApiUserStorage();
    apiUserService = new ApiUserService(apiUserStorage as any);
    reflector = {
      getAllAndOverride: jest.fn()
    } as any;
    for (const apiRole of Object.values(ApiRole)) {
      for (const siteRole of Object.values(SiteRole)) {
        const user = await apiUserService.createApiUser({
          name: `${apiRole}-${siteRole}`,
          config: {
            role: apiRole,
            global: {}
          }
        });
        // shuffle the private key since create random since create random takes too long
        users[apiRole] = users[apiRole] ?? {};
        users[apiRole][siteRole] = {
          ...user,
          wallet,
          apiRole,
          siteRole
        };
      }
    }
  });

  beforeEach(async () => {
    const userParserService = new MockUserParser();
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: Reflector,
          useValue: reflector
        },
        {
          provide: AuthGuard,
          useValue: new AuthGuard(reflector, userParserService, apiUserService)
        }
      ]
    }).compile();
    guard = module.get(AuthGuard);
    reflector = module.get(Reflector);

    /**
     * set the MATCH_SIGNER_METADATA_KEY
     */
    reflector.get = jest.fn().mockReturnValueOnce('id');
  });

  it('should have all of the providers defined', () => {
    expect(guard).toBeDefined();
    expect(reflector).toBeDefined();
    expect(apiUserStorage).toBeDefined();
    expect(apiUserService).toBeDefined();
  });

  describe('HTTP Context', () => {
    let reqMock: { headers: Record<string, string> };
    let resMock: { header: jest.Mock<any, any> };
    let headerSettingMock: jest.Mock;

    const getUserContext = async (
      siteRole: SiteRole,
      apiRole: ApiRole,
      overrides?: {
        reqHeaders?: Record<string, string>;
        reqMock?: Record<string, any>;
      }
    ) => {
      const user = await getUser(apiRole, siteRole);
      const handler = function useReflector() {
        return 'string';
      };
      const requestMock = {
        ...reqMock,
        headers: {
          ...reqMock.headers,
          ...user.apiAuthHeaders,
          ...user.siteAuthHeaders,
          ...(overrides?.reqHeaders ?? {})
        },
        params: {
          id: wallet.address // the match signer metadata key
        },
        ...(overrides?.reqMock ?? {})
      };
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => requestMock
      });

      return { ctxMock, user };
    };

    beforeEach(() => {
      headerSettingMock = jest.fn();
      resMock = {
        header: headerSettingMock
      };
      reqMock = {
        headers: {} as any
      };
    });

    afterEach(() => {
      headerSettingMock.mockClear();
    });

    it('should not require auth if roles are not specified', async () => {
      handler = function useReflector() {
        return 'string';
      };
      reflector.getAllAndMerge = jest.fn().mockReturnValue([]); // no roles
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock
      });

      const canActivateWithoutRoles = await guard.canActivate(ctxMock);
      expect(canActivateWithoutRoles).toBe(true);

      reflector.getAllAndMerge = jest.fn().mockReturnValue(undefined); // no roles
      const canActivateWithUndefinedRoles = await guard.canActivate(ctxMock);
      expect(canActivateWithUndefinedRoles).toBe(true);
    });

    it('should not require auth for guest roles', async () => {
      handler = function useReflector() {
        return 'string';
      };
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.Guest]);
      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock
      });

      const canActivate = await guard.canActivate(ctxMock);
      expect(canActivate).toBe(true);
    });

    it('should require user auth for non-guest site roles', async () => {
      try {
        handler = function useReflector() {
          return 'string';
        };
        reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.User]).mockReturnValueOnce([ApiRole.Guest]);
        const unAuthenticatedCtx = contextMockFactory('http', handler, {
          getResponse: () => resMock,
          getRequest: () => reqMock
        });

        await expect(guard.canActivate(unAuthenticatedCtx)).rejects.toThrowError(AuthException);

        reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Admin]).mockReturnValueOnce([ApiRole.Guest]);
        await expect(guard.canActivate(unAuthenticatedCtx)).rejects.toThrowError(AuthException);

        reflector.getAllAndMerge = jest
          .fn()
          .mockReturnValueOnce([SiteRole.SuperAdmin])
          .mockReturnValueOnce([ApiRole.Guest]);

        await expect(guard.canActivate(unAuthenticatedCtx)).rejects.toThrowError(AuthException);

        const { ctxMock } = await getUserContext(SiteRole.User, ApiRole.Guest);
        reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.User]).mockReturnValueOnce([ApiRole.Guest]);
        await expect(guard.canActivate(ctxMock)).resolves.toBe(true);
      } catch (err) {
        console.error(err);
        expect(true).toBe(false);
      }
    });

    it('should require auth for non-guest api roles', async () => {
      const { ctxMock: unauthorizedCtxMock } = await getUserContext(SiteRole.Guest, ApiRole.Guest);
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      await expect(guard.canActivate(unauthorizedCtxMock)).rejects.toThrow(AuthException);

      const { ctxMock: userAuthorizedCtxMock } = await getUserContext(SiteRole.Guest, ApiRole.ApiUser);
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      await expect(guard.canActivate(userAuthorizedCtxMock)).resolves.toBe(true);
    });

    it('should allow higher api roles to perform all actions of lower roles', async () => {
      const { ctxMock: adminCtx } = await getUserContext(SiteRole.Guest, ApiRole.ApiAdmin);
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      await expect(guard.canActivate(adminCtx)).resolves.toBe(true);

      const { ctxMock: superAdminCtx } = await getUserContext(SiteRole.Guest, ApiRole.ApiSuperAdmin);
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      await expect(guard.canActivate(superAdminCtx)).resolves.toBe(true);

      reflector.getAllAndMerge = jest
        .fn()
        .mockReturnValueOnce([SiteRole.Guest])
        .mockReturnValueOnce([ApiRole.ApiAdmin]);
      await expect(guard.canActivate(superAdminCtx)).resolves.toBe(true);
    });

    it('should require the api user to provide a valid api key and api secret', async () => {
      const { ctxMock: invalidApiKeyCtx } = await getUserContext(SiteRole.Guest, ApiRole.ApiUser, {
        reqHeaders: { [API_KEY_HEADER]: 'asdf' }
      });
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      await expect(guard.canActivate(invalidApiKeyCtx)).rejects.toThrow(AuthException);

      const { ctxMock: invalidApiSecretCtx } = await getUserContext(SiteRole.Guest, ApiRole.ApiUser, {
        reqHeaders: { [API_SECRET_HEADER]: 'asdf' }
      });
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      await expect(guard.canActivate(invalidApiSecretCtx)).rejects.toThrow(AuthException);
    });

    it('should require the site user to have a valid nonce', async () => {
      const { ctxMock: expiredNonceCtx } = await getUserContext(SiteRole.User, ApiRole.Guest, {
        reqHeaders: { [AUTH_NONCE_HEADER]: '0' }
      });
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.User]).mockReturnValueOnce([ApiRole.Guest]);
      await expect(guard.canActivate(expiredNonceCtx)).rejects.toThrow(AuthException);

      const { ctxMock: missingNonceCtx } = await getUserContext(SiteRole.User, ApiRole.Guest, {
        reqHeaders: { [AUTH_NONCE_HEADER]: '' }
      });
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.User]).mockReturnValueOnce([ApiRole.Guest]);
      await expect(guard.canActivate(missingNonceCtx)).rejects.toThrow(AuthException);

      const { ctxMock: barelyExpiredNonceCtx } = await getUserContext(SiteRole.User, ApiRole.Guest, {
        reqHeaders: { [AUTH_NONCE_HEADER]: `${Date.now() - 1000}` }
      });
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.User]).mockReturnValueOnce([ApiRole.Guest]);
      await expect(guard.canActivate(barelyExpiredNonceCtx)).rejects.toThrow(AuthException);
    });

    it('should set the apiUser on the request object if the endpoint requires more than a guest role', async () => {
      const { ctxMock: userCtx } = await getUserContext(SiteRole.Guest, ApiRole.ApiUser);
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.ApiUser]);
      const canActivate = await guard.canActivate(userCtx);
      expect(canActivate).toBe(true);
      const request = userCtx.switchToHttp().getRequest();
      expect(request.apiUser).toBeDefined();

      const { ctxMock: userCtxForGuestEP } = await getUserContext(SiteRole.Guest, ApiRole.ApiUser);
      reflector.getAllAndMerge = jest.fn().mockReturnValueOnce([SiteRole.Guest]).mockReturnValueOnce([ApiRole.Guest]);
      const canActivateGuestEP = await guard.canActivate(userCtxForGuestEP);
      expect(canActivateGuestEP).toBe(true);
      const guestRequest = userCtxForGuestEP.switchToHttp().getRequest();
      expect(guestRequest.apiUser).not.toBeDefined();
    });
  });
});
