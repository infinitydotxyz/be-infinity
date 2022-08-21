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
}

export const devOptionalEnvVariables: (keyof EnvironmentVariables)[] = ['REDIS_URL'];
