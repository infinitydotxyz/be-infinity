import { Env } from '@infinityxyz/lib/utils';

export interface EnvironmentVariables {
  twitterBearerToken: string;
  ALCHEMY_API_KEY: string;
  mnemonicApiKey: string;
  alchemyJsonRpcEthMainnet: string;
  alchemyJsonRpcPolygonMainnet: string;
  alchemyJsonRpcEthGoerli: string;
  GEM_API_KEY: string;
  OPENSEA_API_KEYS: string[];
  RESERVOIR_API_KEY: string;
  ZORA_API_KEY: string;
  INFINITY_NODE_ENV: Env;
  firebaseServiceAccount: object;
  REDIS_URL?: string;
  PG_HOST: string;
  PG_PORT: string;
  PG_USER: string;
  PG_PASS: string;
  PG_DB_NAME: string;
  snapshotBucket: string;
  MATCHING_ENGINE_API_URL: string;
  MATCHING_ENGINE_API_KEY: string;
}

export const devOptionalEnvVariables: (keyof EnvironmentVariables)[] = ['REDIS_URL'];
