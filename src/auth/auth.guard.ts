import { LOGIN_NONCE_EXPIRY_TIME, trimLowerCase } from '@infinityxyz/lib/utils';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { auth } from '../constants';
import { ethers } from 'ethers';
import { Reflector } from '@nestjs/core';
import { metadataKey } from 'auth/match-signer.decorator';
import { UserParserService } from 'user/parser/parser.service';
import { base64Decode } from 'utils';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private userParserService: UserParserService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const paramName = this.reflector.get<string>(metadataKey, context.getHandler());
    const nonce = request.headers?.[auth.nonce];
    const messageHeader = base64Decode(request.headers?.[auth.message]);
    const signatureHeader = request.headers?.[auth.signature];

    if (!nonce || !messageHeader || !signatureHeader) {
      return false;
    }

    try {
      const signingAddress = trimLowerCase(ethers.utils.verifyMessage(messageHeader, JSON.parse(signatureHeader)));
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
}
