import { TokenStandard } from '@infinityxyz/lib/types/core';

export interface OpenseaAsset {
  /**
   * opensea id
   */
  id?: number;
  num_sales?: number;
  name: string;
  token_id: string;
  external_link: string;
  image_url: string;
  image_original_url: string;
  traits: OpenseaAssetTrait[];
  background_color: string;
  animation_url: string;
  animation_original_url?: string;
  description: string;
  permalink: string;
  decimals?: number;
  owner?: OpenseaAssetOwner;
  asset_contract: OpenseaContract;
  /**
   * link to the token metadata
   */
  token_metadata: string;
}

export interface OpenseaAssetOwner {
  address: string;
  profile_img_url: string;
  config: string;
}

export interface OpenseaAssetTrait {
  trait_type: string;
  value: string;
}

export interface OpenseaAssetsResponse {
  next: string;
  previous: string;
  assets: OpenseaAsset[];
}

export interface OpenseaNFTMetadataResponse {
  name: string;
  description: string;
  external_link: string;
  image: string;
  animation_url: string;
}

export interface OpenseaContract {
  collection: OpenseaCollection;
  address: string;
  asset_contract_type: string;
  created_date: string;
  name: string;
  nft_version: string;
  opensea_version?: unknown;
  owner: number;
  schema_name: string;
  symbol: string;
  total_supply?: unknown;
  description: string;
  external_link: string;
  image_url: string;
  default_to_fiat: boolean;
  dev_buyer_fee_basis_points: number;
  dev_seller_fee_basis_points: number;
  only_proxied_transfers: boolean;
  opensea_buyer_fee_basis_points: number;
  opensea_seller_fee_basis_points: number;
  buyer_fee_basis_points: number;
  seller_fee_basis_points: number;
  payout_address?: unknown;
  display_data?: { card_display_style: string };
}

export interface OpenseaCollection {
  banner_image_url: string;
  chat_url?: string;
  created_date: string;
  default_to_fiat: boolean;
  description: string;
  dev_buyer_fee_basis_points: string;
  dev_seller_fee_basis_points: string;
  discord_url: string;
  display_data: DisplayData;
  external_url: string;
  featured: boolean;
  featured_image_url: string;
  hidden: boolean;
  safelist_request_status: string;
  image_url: string;
  is_subject_to_whitelist: boolean;
  large_image_url: string;
  medium_username?: string;
  name: string;
  only_proxied_transfers: boolean;
  opensea_buyer_fee_basis_points: string;
  opensea_seller_fee_basis_points: string;
  payout_address?: string;
  require_email: boolean;
  short_description?: string;
  slug: string;
  telegram_url?: string;
  twitter_username: string;
  instagram_username?: string;
  wiki_url: string;
  primary_asset_contracts?: Array<{
    address: string;
    asset_contract_type: string;
    created_date: string;
    name: string;
    nft_version: string;
    opensea_version: any;
    owner: number;
    schema_name: TokenStandard | string;
    symbol: string;
    total_supply: string; // not accurate
    description: string;
    external_link: string;
    image_url: string;
    default_to_fiat: boolean;
    dev_buyer_fee_basis_points: number;
    dev_seller_fee_basis_points: number;
    only_proxied_transfers: boolean;
    opensea_buyer_fee_basis_points: number;
    opensea_seller_fee_basis_points: number;
    buyer_fee_basis_points: number;
    seller_fee_basis_points: number;
    payout_address: string;
  }>;
}

interface DisplayData {
  card_display_style: string;
}

export interface OpenseaCollectionStatsResponse {
  stats: OpenseaCollectionStats;
}

export interface OpenseaCollectionStats {
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

export interface OpenseaCollectionsResponse {
  collections: OpenseaCollection[];
}
