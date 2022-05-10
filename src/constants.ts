import { OrderDirection } from '@infinityxyz/lib/types/core';
import 'dotenv/config';

const getEnvironmentVariable = (name: string, required = true) => {
  const variable = process.env[name];
  if (required && !variable) {
    // Throw new Error(`Missing environment variable ${name}`);
  }
  return variable;
};

export const TEST_ROOT = getEnvironmentVariable('firestoreTestRoot', false) ?? 'testRoot';
export const COVALENT_API_KEY = getEnvironmentVariable('covalentKey');
export const UNMARSHALL_API_KEY = getEnvironmentVariable('unmarshalKey');
export const ALCHEMY_JSON_RPC_ETH_MAINNET = getEnvironmentVariable('alchemyJsonRpcEthMainnet');
export const ALCHEMY_JSON_RPC_POLYGON_MAINNET = getEnvironmentVariable('alchemyJsonRpcPolygonMainnet');
export const OPENSEA_API_KEY = getEnvironmentVariable('openseaKey');
export const TWITTER_BEARER_TOKEN = getEnvironmentVariable('twitterBearerToken');
export const ETHERSCAN_API_KEY = getEnvironmentVariable('etherscanApiKey');
export const ICY_TOOLS_API_KEY = getEnvironmentVariable('icyToolsApiKey');

export const TRACE_LOG = getEnvironmentVariable('TRACE_LOG', false) === 'true';
export const INFO_LOG = getEnvironmentVariable('INFO_LOG', false) === 'true';
export const ERROR_LOG = getEnvironmentVariable('ERROR_LOG', false) === 'true';
export const WARN_LOG = getEnvironmentVariable('WARN_LOG', false) === 'true';

export const auth = {
  signature: 'x-auth-signature',
  message: 'x-auth-message'
};

export const API_BASE = 'https://sv-dev.nftcompany.com';
export const SITE_BASE = 'https://dev.nftcompany.com';

export const SALE_FEES_TO_PURCHASE_FEES_RATIO = 5;

// todo: remove these
export const POLYGON_WYVERN_EXCHANGE_ADDRESS = '0xbfbf0bd8963fe4f5168745ad59da20bf78d6385e';
export const WYVERN_EXCHANGE_ADDRESS = '0x7be8076f4ea4a4ad08075c2508e481d6c946d12b';

export const OPENSEA_API = 'https://api.opensea.io/api/v1/';

export const DEFAULT_MIN_ETH = 0.0000001;
export const DEFAULT_MAX_ETH = 1000000; // For listings
export const DEFAULT_PRICE_SORT_DIRECTION = OrderDirection.Descending;

export const INFINITY_EMAIL = 'hi@infinity.xyz';
export const FB_STORAGE_BUCKET = 'nftc-dev.appspot.com';
export const FIREBASE_SERVICE_ACCOUNT = 'nftc-dev-firebase-creds.json';
export const ORIGIN = 'https://dev.nftcompany.com';
export const INFINITY_URL = 'https://infinity.xyz/';

export const ONE_HOUR = 3_600_000; // In ms
export const ONE_DAY = ONE_HOUR * 24;
export const MIN_TWITTER_UPDATE_INTERVAL = ONE_HOUR; // In ms
export const MIN_DISCORD_UPDATE_INTERVAL = ONE_HOUR;
export const MIN_LINK_UPDATE_INTERVAL = ONE_HOUR;
export const MIN_COLLECTION_STATS_UPDATE_INTERVAL = ONE_HOUR / 4; // 15 min
