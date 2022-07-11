export type ApiUserConfig = {
  global: {
    limit?: number;
    ttl?: number;
  };

  hmac: string;
};

export interface ApiUserCreds {
  apiKey: string;

  apiSecret: string;
}

export interface ApiUser {
  id: string;

  name: string;

  config: ApiUserConfig;

  createdAt: number;

  updatedAt: number;
}
