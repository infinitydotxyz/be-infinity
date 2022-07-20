import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiUserModule } from 'api-user/api-user.module';
import { UserParserModule } from 'user/parser/parser.module';
import { UserParserService } from 'user/parser/parser.service';
import { UserModule } from 'user/user.module';
import { AuthGuard } from './auth.guard';

class Dummy {}

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

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserParserService,
        AuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn()
          }
        }
      ],
      imports: [UserParserModule, UserModule, ApiUserModule]
    }).compile();
    guard = module.get(AuthGuard);
    reflector = module.get(Reflector);
  });
});
