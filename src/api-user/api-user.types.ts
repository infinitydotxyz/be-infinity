import { ApiRole } from 'auth-v2/auth.constants';

export interface ApiUserCreds {
  apiKey: string;

  apiSecret: string;
}

// export enum ApiUserRole {
//   User = 'user',
//   Admin = 'admin'
// }

// export const RoleHierarchy = {
//   [ApiUserRole.User]: 1,
//   [ApiUserRole.Admin]: 100
// };

export interface ApiUser {
  id: string;

  name: string;

  config: ApiUserConfig;

  createdAt: number;

  updatedAt: number;
}

export type ApiUserConfig = {
  global: {
    limit?: number;
    ttl?: number;
  };

  hmac: string;

  role: ApiRole;
};

export type ApiUserConfigKeys = keyof ApiUserConfig;
