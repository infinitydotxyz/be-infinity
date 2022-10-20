import { paths } from '@reservoir0x/reservoir-kit-client';
import { SignedOBOrderDto } from '@infinityxyz/lib/types/dto/orders/signed-ob-order.dto';
import { ChainId, TokenStandard } from '@infinityxyz/lib/types/core';
import { getSearchFriendlyString } from '@infinityxyz/lib/utils/formatters';
import { NftDto } from '@infinityxyz/lib/types/dto';

type ReservoirAsk = NonNullable<paths['/orders/asks/v3']['get']['responses']['200']['schema']['orders']>[0];
type ReservoirBid = NonNullable<paths['/orders/bids/v4']['get']['responses']['200']['schema']['orders']>[0];
type ReservoirToken = NonNullable<paths['/tokens/v5']['get']['responses']['200']['schema']['tokens']>[0];

export interface ReservoirResponse {
  cursor: string;
  orders: SignedOBOrderDto[];
}

export interface ReservoirTokenResponse {
  cursor: string;
  nfts: NftDto[];
}

// ==============================================================

export const reservoirTokenToNFT = (x: ReservoirToken): NftDto => {
  return {
    collectionAddress: x.token?.collection?.id,
    chainId: ChainId.Mainnet,
    slug: x.token?.collection?.slug,
    tokenId: x.token?.tokenId ?? '',
    minter: '',
    mintedAt: NaN,
    mintTxHash: '',
    mintPrice: NaN,
    metadata: {
      attributes: [],
      name: x.token?.name ?? '',
      title: '',
      description: x.token?.description ?? '',
      external_url: '',
      image: x.token?.image ?? '',
      image_data: '',
      youtube_url: '',
      animation_url: '',
      background_color: ''
    },
    numTraitTypes: 0,
    updatedAt: Date.now(),
    tokenUri: '',
    rarityRank: x.token?.rarityRank,
    rarityScore: x.token?.rarity,
    image: {
      url: x.token?.image ?? '',
      originalUrl: x.token?.image ?? '',
      updatedAt: Date.now()
    },
    tokenStandard: x.token?.kind === 'erc721' ? TokenStandard.ERC721 : TokenStandard.ERC1155
  };
};

// ==============================================================

export const reservoirAskToOrder = (x: ReservoirAsk): SignedOBOrderDto => {
  //   console.log('=====================================================');
  //   console.log(JSON.stringify(x, null, 2));

  let collectionAddress = '';
  let tokenId = '';

  if (x.tokenSetId) {
    // "token:0x1a8046b6f194f9f5a84bf001e133a4df0a298ad8:198",
    const tokenInfo = x.tokenSetId.split(':');

    if (tokenInfo.length === 3) {
      collectionAddress = tokenInfo[1];
      tokenId = tokenInfo[2];
    }
  }

  const order: SignedOBOrderDto = {
    id: x.id ?? '',
    chainId: '1',
    isSellOrder: x.side === 'sell',
    numItems: 1,
    startPriceEth: x.price?.amount?.native ?? 0,
    endPriceEth: x.price?.amount?.native ?? 0,
    startTimeMs: x.validFrom * 1000,
    endTimeMs: x.validUntil * 1000,
    maxGasPriceWei: '0',
    nonce: 1234567, // TODO - where do we get this?
    makerAddress: x.maker,
    makerUsername: '',
    nfts: [
      {
        chainId: ChainId.Mainnet,
        collectionAddress: collectionAddress,
        collectionImage: '',
        collectionName: x.metadata?.data?.collectionName ?? '',
        collectionSlug: getSearchFriendlyString(x.metadata?.data?.collectionName ?? ''),
        hasBlueCheck: false,
        tokens: [
          {
            attributes: [],
            numTokens: 1,
            takerAddress: '',
            takerUsername: '',
            tokenId: tokenId,
            tokenImage: x.metadata?.data?.image ?? '',
            tokenName: x.metadata?.data?.tokenName ?? ''
          }
        ]
      }
    ],
    signedOrder: {
      isSellOrder: x.side === 'sell',
      signer: '',
      nfts: [
        {
          collection: collectionAddress,
          tokens: [
            {
              numTokens: 1,
              tokenId: tokenId
            }
          ]
        }
      ],
      constraints: [],
      execParams: [],
      extraParams: '',
      sig: '' // TODO - where?
    },
    execParams: {
      complicationAddress: '',
      currencyAddress: ''
    },
    extraParams: { buyer: '' }
  };

  return order;
};

// ==============================================================

export const reservoirBidToOrder = (x: ReservoirBid): SignedOBOrderDto => {
  //   console.log('=====================================================');
  //   console.log(JSON.stringify(x, null, 2));

  let collectionAddress = '';
  let tokenId = '';

  if (x.tokenSetId) {
    // "token:0x1a8046b6f194f9f5a84bf001e133a4df0a298ad8:198",
    const tokenInfo = x.tokenSetId.split(':');

    if (tokenInfo.length === 3) {
      collectionAddress = tokenInfo[1];
      tokenId = tokenInfo[2];
    }
  }

  const order: SignedOBOrderDto = {
    id: x.id ?? '',
    chainId: '1',
    isSellOrder: x.side === 'sell',
    numItems: 1,
    startPriceEth: x.price?.amount?.native ?? 0,
    endPriceEth: x.price?.amount?.native ?? 0,
    startTimeMs: x.validFrom * 1000,
    endTimeMs: x.validUntil * 1000,
    maxGasPriceWei: '0',
    nonce: 1234567, // TODO - where do we get this?
    makerAddress: x.maker,
    makerUsername: '',
    nfts: [
      {
        chainId: ChainId.Mainnet,
        collectionAddress: collectionAddress,
        collectionImage: '',
        collectionName: x.metadata?.data?.collectionName ?? '',
        collectionSlug: getSearchFriendlyString(x.metadata?.data?.collectionName ?? ''),
        hasBlueCheck: false,
        tokens: [
          {
            attributes: [],
            numTokens: 1,
            takerAddress: '',
            takerUsername: '',
            tokenId: tokenId,
            tokenImage: x.metadata?.data?.image ?? '',
            tokenName: x.metadata?.data?.tokenName ?? ''
          }
        ]
      }
    ],
    signedOrder: {
      isSellOrder: x.side === 'sell',
      signer: '',
      nfts: [
        {
          collection: collectionAddress,
          tokens: [
            {
              numTokens: 1,
              tokenId: tokenId
            }
          ]
        }
      ],
      constraints: [],
      execParams: [],
      extraParams: '',
      sig: '' // TODO - where?
    },
    execParams: {
      complicationAddress: '',
      currencyAddress: ''
    },
    extraParams: { buyer: '' }
  };

  return order;
};
