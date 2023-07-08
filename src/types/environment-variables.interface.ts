import { Env } from '@infinityxyz/lib/utils';

export interface EnvironmentVariables {
  API_BASE: string;
  twitterBearerToken: string;
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  TWITTER_BETA_AUTH_ACCOUNT_ID: string;

  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_GUILD_ID: string;
  DISCORD_GUILD_VERIFIED_ROLE_IDS: string[];
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
  FB_STORAGE_BUCKET: string;
  REDIS_URL?: string;
  snapshotBucket: string;

  FRONTEND_HOST: string;

  GOERLI_MATCHING_ENGINE_API_URL: string;
  GOERLI_MATCHING_ENGINE_API_KEY: string;
  GOERLI_EXECUTION_ENGINE_API_URL: string;
  GOERLI_EXECUTION_ENGINE_API_KEY: string;

  MAINNET_MATCHING_ENGINE_API_KEY: string;
  MAINNET_MATCHING_ENGINE_API_URL: string;
  MAINNET_EXECUTION_ENGINE_API_KEY: string;
  MAINNET_EXECUTION_ENGINE_API_URL: string;

  POLYGON_MATCHING_ENGINE_API_KEY: string;
  POLYGON_MATCHING_ENGINE_API_URL: string;
  POLYGON_EXECUTION_ENGINE_API_KEY: string;
  POLYGON_EXECUTION_ENGINE_API_URL: string;
}

export const devOptionalEnvVariables: (keyof EnvironmentVariables)[] = ['REDIS_URL'];
