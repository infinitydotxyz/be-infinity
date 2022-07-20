import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
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

  beforeEach(async () => {
    const modRef = await Test.createTestingModule({
      providers: [
        ApiKeyThrottlerGuard,
        {
          provide: THROTTLER_OPTIONS,
          useValue: {
            limit: 5,
            ttl: 60,
            ignoreUserAgents: [/userAgentIgnore/]
          }
        },
        {
          provide: ThrottlerStorage,
          useClass: ThrottlerStorageServiceMock
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn()
          }
        }
      ]
    }).compile();
    guard = modRef.get(ApiKeyThrottlerGuard);
    reflector = modRef.get(Reflector);
    service = modRef.get<ThrottlerStorageServiceMock>(ThrottlerStorage);
  });
});
