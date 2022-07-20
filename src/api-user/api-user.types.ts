import { ApiRole } from 'auth-v2/auth.constants';

export interface ApiUserCreds {
  apiKey: string;

  apiSecret: string;
}

export interface ApiUser {
  id: string;

  name: string;

  config: ApiUserConfig;

  hmac: string;

  createdAt: number;

  updatedAt: number;
}

export type ApiUserConfig = {
  global: {
    limit?: number;
    ttl?: number;
  };

  role: ApiRole;
};

export type ApiUserConfigKeys = keyof ApiUserConfig;

export interface ApiUserVerifier {
  verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; user: ApiUser } | { isValid: false; reason: string }>;
}
