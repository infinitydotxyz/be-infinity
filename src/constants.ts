import { OrderDirection } from '@infinityxyz/lib/types/core';
import { Env } from '@infinityxyz/lib/utils';
import { AUTH_NONCE_HEADER, AUTH_SIGNATURE_HEADER } from 'auth/auth.constants';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { devOptionalEnvVariables, EnvironmentVariables } from 'types/environment-variables.interface';

const isDeployed = Number(process.env.IS_DEPLOYED) === 1;
export const env = process.env.INFINITY_NODE_ENV || Env.Prod;
export const envFileName = env === Env.Dev ? '.dev.env' : '.env';
export const secondaryEnvFileName = `.env.${env === Env.Prod ? 'production' : 'development'}.${
  isDeployed ? 'deploy' : 'local'
}`;

export const getMultipleEnvVariables = (
  prefix: string,
  minLength = 1,
  envVariables: Record<string, string>
): string[] => {
  const variables = [];
  let i = 0;

  for (;;) {
    try {
      const apiKey = envVariables[`${prefix}${i}`];
      if (!apiKey) {
        throw new Error(`Missing environment variable ${name}`);
      }
      variables.push(apiKey);
      i += 1;
    } catch (err) {
      break;
    }
  }

  if (variables.length < minLength) {
    throw new Error(
      `Env Variable: ${prefix} failed to get min number of keys. Found: ${variables.length} Expected: at least ${minLength}`
    );
  }
  return variables;
};

export const loadJsonFile = <T = any>(fileName: string): T => {
  const path = resolve(__dirname, './creds', fileName);
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error(`Failed to load json file from path: ${path}`, err);
    throw err;
  }
};

export const validateAndTransformEnvVariables = (env: Record<string, string>) => {
  const openseaApiKeys = getMultipleEnvVariables('OPENSEA_API_KEY', 1, env);
  const INFINITY_NODE_ENV = (env.INFINITY_NODE_ENV as Env | undefined) ?? Env.Prod;
  const isProd = INFINITY_NODE_ENV === Env.Prod;
  const firebaseServiceAccountName = isProd ? 'nftc-infinity-firebase-creds.json' : 'nftc-dev-firebase-creds.json';
  const firebaseServiceAccount = loadJsonFile<object>(firebaseServiceAccountName);
  const FB_STORAGE_BUCKET = isProd ? 'nftc-infinity.appspot.com' : 'nftc-dev.appspot.com';

  const envVariables: EnvironmentVariables = {
    FRONTEND_HOST: env.FRONTEND_HOST,
    API_BASE: env.API_BASE,
    twitterBearerToken: env.twitterBearerToken,
    ALCHEMY_API_KEY: env.ALCHEMY_API_KEY,
    mnemonicApiKey: env.mnemonicApiKey,
    alchemyJsonRpcEthMainnet: env.alchemyJsonRpcEthMainnet,
    alchemyJsonRpcPolygonMainnet: env.alchemyJsonRpcPolygonMainnet,
    alchemyJsonRpcEthGoerli: env.alchemyJsonRpcEthGoerli,
    REDIS_URL: env.REDIS_URL ?? '',
    GEM_API_KEY: env.GEM_API_KEY,
    OPENSEA_API_KEYS: openseaApiKeys,
    RESERVOIR_API_KEY: env.RESERVOIR_API_KEY,
    ZORA_API_KEY: env.ZORA_API_KEY,
    INFINITY_NODE_ENV,
    firebaseServiceAccount,
    FB_STORAGE_BUCKET,
    TWITTER_CLIENT_ID: env.TWITTER_CLIENT_ID,
    TWITTER_CLIENT_SECRET: env.TWITTER_CLIENT_SECRET,
    TWITTER_BETA_AUTH_ACCOUNT_ID: env.TWITTER_BETA_AUTH_ACCOUNT_ID,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
    DISCORD_GUILD_ID: env.DISCORD_GUILD_ID,
    DISCORD_GUILD_VERIFIED_ROLE_IDS: env.DISCORD_GUILD_VERIFIED_ROLE_IDS.split(',').filter((item) => !!item.trim()),
    snapshotBucket: isProd ? 'infinity-orderbook-snapshots' : 'orderbook-snapshots',
    GOERLI_MATCHING_ENGINE_API_URL: env.GOERLI_MATCHING_ENGINE_API_URL,
    GOERLI_MATCHING_ENGINE_API_KEY: env.GOERLI_MATCHING_ENGINE_API_KEY,
    GOERLI_EXECUTION_ENGINE_API_URL: env.GOERLI_EXECUTION_ENGINE_API_URL,
    GOERLI_EXECUTION_ENGINE_API_KEY: env.GOERLI_EXECUTION_ENGINE_API_KEY,
    MAINNET_EXECUTION_ENGINE_API_KEY: env.MAINNET_EXECUTION_ENGINE_API_KEY,
    MAINNET_EXECUTION_ENGINE_API_URL: env.MAINNET_EXECUTION_ENGINE_API_URL,
    MAINNET_MATCHING_ENGINE_API_KEY: env.MAINNET_MATCHING_ENGINE_API_KEY,
    MAINNET_MATCHING_ENGINE_API_URL: env.MAINNET_MATCHING_ENGINE_API_URL,
    POLYGON_MATCHING_ENGINE_API_KEY: env.POLYGON_MATCHING_ENGINE_API_KEY,
    POLYGON_MATCHING_ENGINE_API_URL: env.POLYGON_MATCHING_ENGINE_API_URL,
    POLYGON_EXECUTION_ENGINE_API_KEY: env.POLYGON_EXECUTION_ENGINE_API_KEY,
    POLYGON_EXECUTION_ENGINE_API_URL: env.POLYGON_EXECUTION_ENGINE_API_URL
  };

  for (const key of Object.keys(envVariables) as (keyof EnvironmentVariables)[]) {
    const isRequiredInProd = true;
    const isRequiredInDev = !devOptionalEnvVariables.includes(key);
    const isRequired = isProd ? isRequiredInProd : isRequiredInDev;
    if (isRequired && !envVariables[key]) {
      throw new Error(`Environment variable ${key} is not set`);
    }
  }
  return envVariables;
};

export const auth = {
  nonce: AUTH_NONCE_HEADER,
  signature: AUTH_SIGNATURE_HEADER
};

export const DEFAULT_MIN_ETH = 0.0000001;
export const DEFAULT_MAX_ETH = 1000000; // For listings
export const DEFAULT_PRICE_SORT_DIRECTION = OrderDirection.Descending;

export const INFINITY_EMAIL = 'hi@pixelpack.io';
// export const FB_STORAGE_BUCKET = 'nftc-dev.appspot.com';
export const ORIGIN = /http:\/\/localhost:\d+/;
export const INFINITY_URL = 'https://pixelpack.io/';

export const DEFAULT_MIN_XFL_BALANCE_FOR_ZERO_FEE = 100_000;

export const ONE_MIN = 1000 * 60;
export const TEN_MINS = ONE_MIN * 10;
export const ONE_HOUR = 3_600_000; // In ms
export const ONE_DAY = ONE_HOUR * 24;
export const MIN_TWITTER_UPDATE_INTERVAL = ONE_HOUR; // In ms
export const MIN_DISCORD_UPDATE_INTERVAL = ONE_HOUR;
export const MIN_LINK_UPDATE_INTERVAL = ONE_HOUR;
export const MIN_COLLECTION_STATS_UPDATE_INTERVAL = ONE_HOUR / 4; // 15 min

export const ALCHEMY_CACHED_IMAGE_HOST = 'cloudinary';
