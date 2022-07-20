import { LOGIN_NONCE_EXPIRY_TIME, trimLowerCase } from '@infinityxyz/lib/utils';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { auth } from '../constants';
import { ethers } from 'ethers';
import { Reflector } from '@nestjs/core';
import { UserParserService } from 'user/parser/parser.service';
import { base64Decode, base64Encode } from 'utils';
import { MATCH_SIGNER_METADATA_KEY } from 'auth-v2/auth.constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private userParserService: UserParserService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const paramName = this.reflector.get<string>(MATCH_SIGNER_METADATA_KEY, context.getHandler());
    const nonce = request.headers?.[auth.nonce];
    const messageHeader = request.headers?.[auth.message];
    const signatureHeader = request.headers?.[auth.signature];

    if (!nonce || !messageHeader || !signatureHeader) {
      return false;
    }

    const constructedMsg = this.getEncodedLoginMessage(nonce);
    if (constructedMsg !== messageHeader) {
      return false;
    }

    const decodedMessageHeader = base64Decode(request.headers?.[auth.message]);
    try {
      const signingAddress = trimLowerCase(
        ethers.utils.verifyMessage(decodedMessageHeader, JSON.parse(signatureHeader))
      );
      if (!signingAddress) {
        return false;
      }
      const paramValue = request.params[paramName];
      const user = await this.userParserService.parse(paramValue);
      const isSigValid = user.userAddress === signingAddress;
      const isNonceValid = Date.now() - nonce < LOGIN_NONCE_EXPIRY_TIME;
      return isSigValid && isNonceValid;
    } catch (err: any) {
      return false;
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
}
