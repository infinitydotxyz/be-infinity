import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage
} from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { THROTTLER_LIMIT, THROTTLER_SKIP, THROTTLER_TTL } from './throttler.constants';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { ApiUserService } from 'api-user/api-user.service';
import { AuthException } from 'auth-v2/auth.exception';

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() protected readonly options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() protected readonly storageService: ThrottlerStorage,
    protected readonly reflector: Reflector,
    private apiUserService: ApiUserService
  ) {
    super(options, storageService, reflector);
  }

  protected getTrackers(req: Record<string, any>): { ip: string } | { ip: string; apiKey: string; apiSecret: string } {
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    if (apiKey && apiSecret) {
      return { ip, apiKey, apiSecret };
    }
    return { ip };
  }

  /**
   * Throttle requests against their TTL limit and whether to allow or deny it.
   * Based on the context type different handlers will be called.
   * @throws ThrottlerException
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Return early if the current route should be skipped.
    if (this.reflector.getAllAndOverride<boolean>(THROTTLER_SKIP, [handler, classRef])) {
      return true;
    }

    const routeOrClassLimit = this.reflector.getAllAndOverride<number>(THROTTLER_LIMIT, [handler, classRef]);
    const routeOrClassTtl = this.reflector.getAllAndOverride<number>(THROTTLER_TTL, [handler, classRef]);

    // Check if specific limits are set at class or route level, otherwise use global options.
    const limit = (routeOrClassLimit || this.options.limit) as number;
    const ttl = (routeOrClassTtl || this.options.ttl) as number;
    return this.handleRequest(context, limit, ttl);
  }

  /**
   * Throttles incoming HTTP requests.
   * All the outgoing requests will contain RFC-compatible RateLimit headers.
   * @see https://tools.ietf.org/id/draft-polli-ratelimit-headers-00.html#header-specifications
   * @throws ThrottlerException
   */
  protected async handleRequest(
    context: ExecutionContext,
    routeOrClassLimit: number,
    routeOrClassTTL: number
  ): Promise<boolean> {
    // Here we start to check the amount of requests being done against the ttl.
    const { req, res } = this.getRequestResponse(context);
    let limit = routeOrClassLimit;
    let ttl = routeOrClassTTL;

    // Return early if the current user agent should be ignored.
    if (Array.isArray(this.options.ignoreUserAgents)) {
      for (const pattern of this.options.ignoreUserAgents) {
        if (pattern.test(req.headers['user-agent'])) {
          return true;
        }
      }
    }
    const trackers = this.getTrackers(req);

    let key = '';
    if ('apiKey' in trackers) {
      key = this.generateKeyForApiKey(context, trackers.apiKey);
      const result = await this.apiUserService.verifyAndGetUserConfig(trackers.apiKey, trackers.apiSecret);
      if (!result.isValid) {
        throw new AuthException('Invalid api key or api secret');
      }
      limit = result.user.config.global.limit || limit;
      ttl = result.user.config.global.ttl || ttl;
    } else {
      key = this.generateKeyForIp(context, trackers.ip);
    }
    const ttls = await this.storageService.getRecord(key);

    const nearestExpiryTime = ttls.length > 0 ? Math.ceil((ttls[0] - Date.now()) / 1000) : 0;

    // Throw an error when the user reached their limit.
    if (ttls.length >= limit) {
      res.header('Retry-After', nearestExpiryTime);
      this.throwThrottlingException(context);
    }

    res.header(`${this.headerPrefix}-Limit`, limit);
    // We're about to add a record so we need to take that into account here.
    // Otherwise the header says we have a request left when there are none.
    res.header(`${this.headerPrefix}-Remaining`, Math.max(0, limit - (ttls.length + 1)));
    res.header(`${this.headerPrefix}-Reset`, nearestExpiryTime);

    await this.storageService.addRecord(key, ttl);
    return true;
  }

  protected generateKeyForIp(context: ExecutionContext, suffix: string): string {
    const prefix = `${context.getClass().name}-${context.getHandler().name}`;
    return this.hash(`${prefix}-${suffix}`);
  }

  protected generateKeyForApiKey(context: ExecutionContext, apiKey: string): string {
    const prefix = 'api-key-global-ttl';
    const suffix = apiKey;
    return this.hash(`${prefix}-${suffix}`);
  }

  protected hash(data: string) {
    return createHash('md5').update(data).digest('hex');
  }
}
