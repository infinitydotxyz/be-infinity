import { OrderDirection } from '@infinityxyz/lib/types/core';
import 'dotenv/config';

const getEnvironmentVariable = (name: string, required = true) => {
  const variable = process.env[name];
  if (required && !variable) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return variable;
};

const getMultipleEnvVariables = (prefix: string, minLength = 1): (string | undefined)[] => {
  const variables = [];
  let i = 0;

  for (;;) {
    try {
      const apiKey = getEnvironmentVariable(`${prefix}${i}`);
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

export const OPENSEA_API_KEYS = (() => {
  const apiKeys = getMultipleEnvVariables('OPENSEA_API_KEY');
  return apiKeys;
})();

export const ALCHEMY_JSON_RPC_ETH_MAINNET = getEnvironmentVariable('alchemyJsonRpcEthMainnet');
export const ALCHEMY_JSON_RPC_POLYGON_MAINNET = getEnvironmentVariable('alchemyJsonRpcPolygonMainnet');

export const auth = {
  nonce: 'x-auth-nonce',
  signature: 'x-auth-signature',
  message: 'x-auth-message'
};

export const API_BASE = 'http://localhost:9090';
export const SITE_BASE = 'http://localhost:3000';

export const DEFAULT_MIN_ETH = 0.0000001;
export const DEFAULT_MAX_ETH = 1000000; // For listings
export const DEFAULT_PRICE_SORT_DIRECTION = OrderDirection.Descending;

export const INFINITY_EMAIL = 'hi@infinity.xyz';
export const FB_STORAGE_BUCKET = 'nftc-dev.appspot.com';
export const FIREBASE_SERVICE_ACCOUNT = 'nftc-dev-firebase-creds.json';
export const ORIGIN = /http:\/\/localhost:\d+/;
export const INFINITY_URL = 'https://infinity.xyz/';

export const ONE_MIN = 1000 * 60;
export const ONE_HOUR = 3_600_000; // In ms
export const ONE_DAY = ONE_HOUR * 24;
export const MIN_TWITTER_UPDATE_INTERVAL = ONE_HOUR; // In ms
export const MIN_DISCORD_UPDATE_INTERVAL = ONE_HOUR;
export const MIN_LINK_UPDATE_INTERVAL = ONE_HOUR;
export const MIN_COLLECTION_STATS_UPDATE_INTERVAL = ONE_HOUR / 4; // 15 min

// every 1s, collect stats for 1 collection from the list (see: /update-social-stats)
export const UPDATE_SOCIAL_STATS_INTERVAL = 1000;
