import { NftDisplayData } from "@infinityxyz/lib/types/core";

export interface CollectionSearchResultData {
  chainId: string;
  address: string;
  hasBlueCheck: boolean;
  slug: string;
  name: string;
  profileImage: string;
  bannerImage: string;
  allTimeVolume?: number;
  floorPrice?: number;
}

export interface SearchResponse {
  data: CollectionSearchResultData[] | NftDisplayData[];
  cursor: string;
  hasNextPage: boolean;
}
