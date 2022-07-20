import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiParam, ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ResponseDescription } from 'common/response-description';
import { ApiRole, AUTH_MESSAGE_HEADER, AUTH_NONCE_HEADER, AUTH_SIGNATURE_HEADER, SiteRole } from './auth.constants';
import { RequireAuth } from './auth.decorator';
import { AuthGuard } from './auth.guard';
import { MatchSigner } from './match-signer.decorator';

export function ApiSignatureAuth() {
  return applyDecorators(
    ApiSecurity(AUTH_SIGNATURE_HEADER),
    ApiSecurity(AUTH_MESSAGE_HEADER),
    ApiSecurity(AUTH_NONCE_HEADER)
  );
}

export const ApiParamUserId = (name = 'id') =>
  ApiParam({
    name,
    description: 'The id of the user',
    required: true,
    examples: {
      address: {
        summary: 'Via address',
        description: 'Identify a user their wallet address. Format <address>',
        value: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
      },
      username: {
        summary: 'Via username',
        description: 'Identify a user their username. Format <username>',
        value: '_____'
      },
      addressAndChainId: {
        summary: 'Via chain id and address',
        description: 'Identify a user their wallet chain id and address. Format <chainId:address>',
        value: '1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
      }
    },
    schema: { type: 'string' }
  });

export function Auth(
  siteRoles: SiteRole | SiteRole[] = [],
  apiRoles: ApiRole | ApiRole[] = [],
  userIdPathParam?: string
) {
  siteRoles = Array.isArray(siteRoles) ? siteRoles : [siteRoles];
  apiRoles = Array.isArray(apiRoles) ? apiRoles : [apiRoles];
  if (!!siteRoles.find((item) => item !== SiteRole.Guest) && !userIdPathParam) {
    throw new Error('userIdPathParam is required if a non-guest site role is used');
  }

  const apiSignatureAuth = siteRoles.length > 0 ? ApiSignatureAuth() : undefined;
  const apiParamUserId = userIdPathParam ? ApiParamUserId(userIdPathParam) : undefined;
  const matchSigner = userIdPathParam ? MatchSigner(userIdPathParam) : undefined;
  const unauthorizedResponse = ApiUnauthorizedResponse({ description: ResponseDescription.Unauthorized });
  const requireAuth = RequireAuth(siteRoles, apiRoles);
  const guard = UseGuards(AuthGuard);

  const decorators = [apiSignatureAuth, apiParamUserId, matchSigner, unauthorizedResponse, requireAuth, guard].filter(
    (item) => !!item
  ) as (ClassDecorator | MethodDecorator | PropertyDecorator)[];

  return applyDecorators(...decorators);
}
