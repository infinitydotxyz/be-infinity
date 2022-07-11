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

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() protected readonly options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() protected readonly storageService: ThrottlerStorage,
    protected readonly reflector: Reflector // protected userStorage?: UserConfigStorage
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(req: Record<string, any>): string {
    const ip = req.ips.length ? req.ips[0] : req.ip;
    const apiKey = req.headers['x-api-key'];
    const tracker = apiKey ?? ip;
    console.log(`Tracker: ${tracker}`); // TODO remove
    return tracker;
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
  protected async handleRequest(context: ExecutionContext, limit: number, ttl: number): Promise<boolean> {
    // Here we start to check the amount of requests being done against the ttl.
    const { req, res } = this.getRequestResponse(context);

    // Return early if the current user agent should be ignored.
    if (Array.isArray(this.options.ignoreUserAgents)) {
      for (const pattern of this.options.ignoreUserAgents) {
        if (pattern.test(req.headers['user-agent'])) {
          return true;
        }
      }
    }
    const tracker = this.getTracker(req);
    const key = this.generateKey(context, tracker);
    // const userTtls = await this.storageService.getUser(tracker); // TODO get user
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
}
