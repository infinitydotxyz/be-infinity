import { LOGIN_NONCE_EXPIRY_TIME, trimLowerCase } from '@infinityxyz/lib/utils';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiUserService } from 'api-user/api-user.service';
import { AUTH_MESSAGE_HEADER, AUTH_NONCE_HEADER, AUTH_SIGNATURE_HEADER } from 'auth/auth.constants';
import { MATCH_SIGNER_METADATA_KEY } from 'auth/match-signer.decorator';
import { ethers } from 'ethers';
import { UserParserService } from 'user/parser/parser.service';
import { base64Decode, base64Encode } from 'utils';
import {
  ApiRole,
  ApiRoleHierarchy,
  API_KEY_HEADER,
  API_SECRET_HEADER,
  AUTH_API_ROLES,
  AUTH_SITE_ROLES,
  SiteRole,
  SiteRoleHierarchy
} from './auth.constants';
import { AuthException } from './auth.exception';

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
    const siteRolesValid = await this.checkSiteRoles(context, siteRolesRequired);
    const apiRolesValid = await this.checkApiRoles(context, apiRolesRequired);

    return siteRolesValid && apiRolesValid;
  }

  protected async checkApiRoles(context: ExecutionContext, apiRolesRequired: ApiRole[]): Promise<boolean> {
    const minRole = apiRolesRequired.reduce((acc, role) => {
      const accRoleValue = ApiRoleHierarchy[acc];
      const currRoleValue = ApiRoleHierarchy[role];
      return accRoleValue < currRoleValue ? acc : role;
    }, apiRolesRequired[0]);

    if (minRole && minRole !== ApiRole.ApiGuest) {
      const { req } = this.getRequestResponse(context);
      const apiKey = req.headers?.[API_KEY_HEADER];
      const apiSecret = req.headers?.[API_SECRET_HEADER];

      if (!apiKey || !apiSecret) {
        throw new AuthException('API key and secret are required');
      }

      const result = await this.apiUserService.verifyAndGetUserConfig(apiKey, apiSecret);
      if (!result.isValid) {
        throw new AuthException(result.reason);
      }

      const userRole = result.userConfig.role;
      if (!userRole) {
        throw new AuthException('User does not have the required role');
      }

      if (ApiRoleHierarchy[userRole] < ApiRoleHierarchy[minRole]) {
        throw new AuthException('User does not have the required role');
      }
      req.apiUser = result.userConfig;
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
      const isValid = await this.validateSignature(context, request);
      return isValid;
    }
    return true;
  }

  protected async validateSignature(context: ExecutionContext, request: Record<string, any>): Promise<boolean> {
    const nonce = request.headers?.[AUTH_NONCE_HEADER];
    const messageHeader = request.headers?.[AUTH_MESSAGE_HEADER];
    const signatureHeader = request.headers?.[AUTH_SIGNATURE_HEADER];

    if (!nonce || !messageHeader || !signatureHeader) {
      throw new AuthException(
        `Invalid signature headers. ${AUTH_NONCE_HEADER}, ${AUTH_MESSAGE_HEADER}, and ${AUTH_SIGNATURE_HEADER} are required`
      );
    }

    const constructedMsg = this.getEncodedLoginMessage(nonce);
    if (constructedMsg !== messageHeader) {
      throw new AuthException('Invalid signature');
    }

    const decodedMessageHeader = base64Decode(messageHeader);
    try {
      const signingAddress = trimLowerCase(
        ethers.utils.verifyMessage(decodedMessageHeader, JSON.parse(signatureHeader))
      );
      if (!signingAddress) {
        throw new AuthException('Invalid signature');
      }
      const paramName = this.reflector.get<string>(MATCH_SIGNER_METADATA_KEY, context.getHandler());
      const paramValue = request.params[paramName];
      const user = await this.userParserService.parse(paramValue);
      const isSigValid = user.userAddress === signingAddress;
      const isNonceValid = Date.now() - nonce < LOGIN_NONCE_EXPIRY_TIME;
      return isSigValid && isNonceValid;
    } catch (err: any) {
      throw new AuthException('Invalid signature');
    }
  }

  getEncodedLoginMessage(nonce: number): string {
    // ignore the formatting of this multiline string
    const msg = `Welcome to Infinity. Click "Sign" to sign in. No password needed. This request will not trigger a blockchain transaction or cost any gas fees.
 
I accept the Infinity Terms of Service: https://infinity.xyz/terms

Nonce: ${nonce}
Expires in: 24 hrs`;

    return base64Encode(msg);
  }

  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, any>;
    res: Record<string, any>;
  } {
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
