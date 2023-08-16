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
  data: CollectionSearchResultData[] | NftSearchResultData[];
  cursor: string;
  hasNextPage: boolean;
}

export interface NftSearchResultData {
  chainId: string;
  collectionAddress: string;
  tokenId: string;
  name: string;
  numTraitTypes: number;
  image: string;
  tokenStandard: string;
}
