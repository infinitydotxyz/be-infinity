export enum SiteRole {
  /**
   * a user that is not logged in
   * via a wallet signature
   */
  Guest = 'guest',

  /**
   * a user that is logged in
   * via a wallet signature
   */
  User = 'user',

  /**
   * admin that should be able to manage
   * users
   */
  Admin = 'admin',

  /**
   * admin that can manage admins
   */
  SuperAdmin = 'super-admin'
}

export enum ApiRole {
  ApiGuest = 'api-guest',
  ApiUser = 'api-user',
  ApiAdmin = 'api-admin',
  ApiSuperAdmin = 'api-super-admin'
}

export const SiteRoleHierarchy = {
  [SiteRole.Guest]: 0,
  [SiteRole.User]: 1,
  [SiteRole.Admin]: 2,
  [SiteRole.SuperAdmin]: 3
};

export const ApiRoleHierarchy = {
  [ApiRole.ApiGuest]: 0,
  [ApiRole.ApiUser]: 1,
  [ApiRole.ApiAdmin]: 2,
  [ApiRole.ApiSuperAdmin]: 3
};

export const AUTH_SITE_ROLES = 'AUTH:SITE_ROLE';
export const AUTH_API_ROLES = 'AUTH:API_ROLE';
export const MATCH_SIGNER_METADATA_KEY = 'MATCH-SIGNER:PARAMS';

export const API_KEY_HEADER = 'x-api-key';
export const API_SECRET_HEADER = 'x-api-secret';

export const AUTH_NONCE_HEADER = 'x-auth-nonce';
export const AUTH_MESSAGE_HEADER = 'x-auth-message';
export const AUTH_SIGNATURE_HEADER = 'x-auth-signature';
