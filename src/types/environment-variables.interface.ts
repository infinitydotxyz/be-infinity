import { Env } from '@infinityxyz/lib/utils';

export interface EnvironmentVariables {
  TWITTER_BEARER_TOKEN: string;
  ALCHEMY_API_KEY: string;
  MNEMONIC_API_KEY: string;
  ALCHEMY_JSON_RPC_ETH_MAINNET: string;
  ALCHEMY_JSON_RPC_POLYGON_MAINNET: string;
  ALCHEMY_JSON_RPC_GOERLI_MAINNET: string;
  GEM_API_KEY: string;
  OPENSEA_API_KEYS: string[];
  RESERVOIR_API_KEY: string;
  ZORA_API_KEY: string;
  INFINITY_NODE_ENV: Env;
  FIREBASE_SERVICE_ACCOUNT: object;
  REDIS_URL?: string;
}

export const devOptionalEnvVariables: (keyof EnvironmentVariables)[] = ['REDIS_URL'];
