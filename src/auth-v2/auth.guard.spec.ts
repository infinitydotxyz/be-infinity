import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiUserStorage } from 'api-user/api-user-config-storage.interface';
import { ApiUserService } from 'api-user/api-user.service';
import { ApiUser } from 'api-user/api-user.types';
import { ethers } from 'ethers';
import { UserParserService } from 'user/parser/parser.service';
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

  beforeEach(async () => {
    apiUserStorage = new MockApiUserStorage();
    apiUserService = new ApiUserService(apiUserStorage as any);
    reflector = {
      getAllAndOverride: jest.fn()
    } as any;
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
  });

  it('should have all of the providers defined', () => {
    expect(guard).toBeDefined();
    expect(reflector).toBeDefined();
    expect(apiUserStorage).toBeDefined();
    expect(apiUserService).toBeDefined();
  });
});
