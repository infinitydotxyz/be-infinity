import { Collection } from '@infinityxyz/lib/types/core/Collection';
import { Token } from '@infinityxyz/lib/types/core/Token';

export type OrderMetadata = {
  [chainId: string]: {
    [collection: string]: {
      collection: Partial<Collection> | undefined;
      nfts: { [tokenId: string]: Partial<Token> | undefined };
    };
  };
};

export type OrderItemTokenMetadata = {
  tokenId: string;
  numTokens: number;
  tokenImage: string;
  tokenName: string;
  tokenSlug: string;
};
