import { Collection } from '@infinityxyz/lib/types/core/Collection';
import { Token } from '@infinityxyz/lib/types/core/Token';

export type OrderNftMetadata = {
  [tokenId: string]: Partial<Token> | undefined;
};

export type OrderCollectionMetadata = {
  collection: Partial<Collection> | undefined;
  nfts: OrderNftMetadata | undefined;
};

export type OrderChainIdMetadata = { [collection: string]: OrderCollectionMetadata | undefined };

export type OrderMetadata = {
  [chainId: string]: OrderChainIdMetadata | undefined;
};

export type OrderItemTokenMetadata = {
  tokenId: string;
  numTokens: number;
  tokenImage: string;
  tokenName: string;
  tokenSlug: string;
};
