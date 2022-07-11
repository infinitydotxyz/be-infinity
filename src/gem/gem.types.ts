export interface GemCollectionResponse {
  data: GemCollection[];
}

export interface GemCollection {
  name: string;
  symbol: string;
  standard: string;
  description: string;
  address: string;
  createdDate: string;
  externalUrl: string;
  imageUrl: string;
  totalSupply: number;
  isVerified: boolean;
  sevenDayVolume: number;
  oneDayVolume: number;
  lastOpenSeaSaleCreatedId: number;
  lastOpenSeaTransferId: number;
  lastOpenSeaCancelledId: number;
  lastRaribleAssetUpdateId: string;
  lastNumberOfUpdates: number;
  chainId: string;
  indexingStatus: string;
  discordUrl: string;
  mediumUsername: string;
  telegramUrl: string;
  twitterUsername: string;
  instagramUsername: string;
  wikiUrl: string;
  stats: GemCollectionStats;
}

export interface GemCollectionStats {
  one_day_volume: number;
  one_day_change: number;
  one_day_sales: number;
  one_day_average_price: number;
  seven_day_volume: number;
  seven_day_change: number;
  seven_day_sales: number;
  seven_day_average_price: number;
  thirty_day_volume: number;
  thirty_day_change: number;
  thirty_day_sales: number;
  thirty_day_average_price: number;
  total_volume: number;
  total_sales: number;
  total_supply: number;
  count: number;
  num_owners: number;
  average_price: number;
  num_reports: number;
  market_cap: number;
  floor_price: number;
}

export interface GemAssetResponse {
  data: GemAsset[];
}

export interface GemAsset {
  id: string;
  name: string;
  address: string;
  description: string;
  collectionName: string;
  collectionSymbol: string;
  externalLink: string;
  imageUrl: string;
  smallImageUrl: string;
  animationUrl: string;
  tokenMetadata: string;
  standard: string;
  decimals: number;
  // traits: Array;
  // creator: Object;
  // owner: Object;
}
