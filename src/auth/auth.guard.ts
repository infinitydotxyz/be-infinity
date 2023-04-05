import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { LOGIN_NONCE_EXPIRY_TIME, trimLowerCase } from '@infinityxyz/lib/utils';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiUserService } from 'api-user/api-user.service';
import { hasApiRole } from 'api-user/api-user.utils';
import { ethers } from 'ethers';
import { UserParserService } from 'user/parser/parser.service';
import { base64Decode } from 'utils';
import {
  ApiRoleHierarchy,
  API_KEY_HEADER,
  API_SECRET_HEADER,
  AUTH_API_ROLES,
  AUTH_NONCE_HEADER,
  AUTH_SIGNATURE_HEADER,
  AUTH_SITE_ROLES,
  MATCH_SIGNER_METADATA_KEY,
  SiteRole,
  SiteRoleHierarchy
} from './auth.constants';
import { AuthException } from './auth.exception';
import { EIP712Data } from '@infinityxyz/lib/types/core';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private userParserService: UserParserService,
    private apiUserService: ApiUserService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();

    const siteRolesRequired = this.reflector.getAllAndMerge<SiteRole[]>(AUTH_SITE_ROLES, [handler, classRef]);
    const apiRolesRequired = this.reflector.getAllAndMerge<ApiRole[]>(AUTH_API_ROLES, [handler, classRef]);

    const hasSiteRoles = siteRolesRequired && siteRolesRequired.length > 0;
    const hasApiRoles = apiRolesRequired && apiRolesRequired.length > 0;

    if (!hasSiteRoles && !hasApiRoles) {
      return true;
    }

    return this.handleRequest(context, siteRolesRequired, apiRolesRequired);
  }

  protected async handleRequest(context: ExecutionContext, siteRolesRequired: SiteRole[], apiRolesRequired: ApiRole[]) {
    const apiRolesValid = await this.checkApiRoles(context, apiRolesRequired ?? []);
    const siteRolesValid = await this.checkSiteRoles(context, siteRolesRequired ?? []);

    return siteRolesValid && apiRolesValid;
  }

  protected async checkApiRoles(context: ExecutionContext, apiRolesRequired: ApiRole[]): Promise<boolean> {
    const minRole = apiRolesRequired.reduce((acc, role) => {
      const accRoleValue = ApiRoleHierarchy[acc];
      const currRoleValue = ApiRoleHierarchy[role];
      return accRoleValue < currRoleValue ? acc : role;
    }, apiRolesRequired[0]);

    if (minRole && minRole !== ApiRole.Guest) {
      const { req } = this.getRequestResponse(context);
      let apiKey = req.headers?.[API_KEY_HEADER];
      let apiSecret = req.headers?.[API_SECRET_HEADER];

      if (apiKey && !apiSecret) {
        const decoded = base64Decode(apiKey);
        const [key, secret] = decoded.split(':');

        apiKey = key;
        apiSecret = secret;
      }

      if (!apiKey || !apiSecret) {
        throw new AuthException('API key and secret are required');
      }

      const result = await this.apiUserService.verifyAndGetUserConfig(apiKey, apiSecret);
      if (!result.isValid) {
        console.log(`User: ${apiKey} - invalid ID ${apiKey} PATH ${req.path}`);
        throw new AuthException(result.reason);
      }

      const userRole = result.user.config.role;
      if (!userRole) {
        console.log(
          `User: ${result.user.name}:${result.user.config.role} - not authorized for ${minRole} ID ${result.user.id} PATH ${req.path}`
        );
        throw new AuthException('User does not have the required role');
      }

      if (!hasApiRole(userRole, minRole)) {
        console.log(
          `User: ${result.user.name}:${result.user.config.role} - not authorized for ${minRole} ID ${result.user.id} PATH ${req.path}`
        );
        throw new AuthException('User does not have the required role');
      }
      req.apiUser = result.user;
    }
    return true;
  }

  protected async checkSiteRoles(context: ExecutionContext, siteRolesRequired: SiteRole[]): Promise<boolean> {
    const { req: request } = this.getRequestResponse(context);

    const minRole = siteRolesRequired.reduce((acc, role) => {
      const accRoleValue = SiteRoleHierarchy[acc];
      const currRoleValue = SiteRoleHierarchy[role];
      return accRoleValue < currRoleValue ? acc : role;
    }, siteRolesRequired[0]);

    if (minRole && minRole !== SiteRole.Guest) {
      if (minRole === SiteRole.User) {
        const isValid = await this.validateSignature(context, request);
        if (isValid) {
          return true;
        }
        throw new AuthException('Invalid signature');
      } else {
        // future-todo handle admin roles
        throw new AuthException('Admin roles are not yet supported');
      }
    }
    return true;
  }

  protected async validateSignature(context: ExecutionContext, request: Record<string, any>): Promise<boolean> {
    const nonce = request.headers?.[AUTH_NONCE_HEADER];
    const signatureHeader = request.headers?.[AUTH_SIGNATURE_HEADER];
    console.log(`Validating nonce for  ${nonce} and signature ${signatureHeader}`);

    if (!nonce || !signatureHeader) {
      throw new AuthException(
        `Invalid signature headers. ${AUTH_NONCE_HEADER}, and ${AUTH_SIGNATURE_HEADER} are required`
      );
    }

    console.log('here');
    const { domain, types, value } = AuthGuard.getLoginMessage(nonce);

    try {
      const signingAddress = trimLowerCase(
        ethers.utils.verifyTypedData(domain, types, value as Record<string, any>, signatureHeader)
      );
      console.log(signingAddress);
      if (!signingAddress) {
        throw new AuthException('Invalid signature');
      }
      const paramName = this.reflector.get<string>(MATCH_SIGNER_METADATA_KEY, context.getHandler());
      const paramValue = request.params[paramName];
      const user = await this.userParserService.parse(paramValue);
      const isSigValid = user.userAddress === signingAddress;
      const isNonceValid = Date.now() - nonce < LOGIN_NONCE_EXPIRY_TIME;
      if (!isSigValid) {
        throw new AuthException('Invalid signature');
      } else if (!isNonceValid) {
        throw new AuthException('Invalid nonce');
      }
      return true;
    } catch (err: any) {
      console.log(err);
      if (err instanceof AuthException) {
        throw err;
      }
      throw new AuthException('Invalid signature');
    }
  }

  static getLoginMessage(nonce: string): Omit<EIP712Data, 'domain'> & { domain: { name: string; version: string } } {
    const domain = {
      name: 'Flow',
      version: '1'
    };
    const types = {
      Data: [
        { name: 'message', type: 'string' },
        { name: 'terms', type: 'string' },
        { name: 'nonce', type: 'uint256' }
      ]
    };
    const getData = (nonce: string) => {
      return {
        message: `Welcome to Flow. Click "Sign" to sign in. This is a one-time action. No password needed. This request will not trigger a blockchain transaction or cost any gas fees.`,
        terms: 'I accept the Flow Terms of Service: https://flow.so/terms',
        nonce
      };
    };

    const value = getData(nonce);

    return {
      signatureKind: 'eip712',
      domain: domain,
      types,
      value
    };
  }

  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, any>;
    res: Record<string, any>;
  } {
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
