import { ChainId } from '@infinityxyz/lib/types/core';
import { TokenStandard } from '@infinityxyz/lib/types/core/Token';
import { NftDto } from '@infinityxyz/lib/types/dto/collections/nfts/nft.dto';
import {
  ReservoirCollsSortBy,
  ReservoirDetailedTokensResponse,
  ReservoirTopCollectionOwnersResponse
} from '@infinityxyz/lib/types/services/reservoir';
import { getSearchFriendlyString, sleep } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import got, { Got, Response } from 'got/dist/source';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { gotErrorHandler } from '../utils/got';
import {
  ReservoirCollectionSearch,
  ReservoirCollectionsV6,
  ReservoirOrderDepth,
  ReservoirOrders,
  ReservoirSales,
  ReservoirTokensResponseV6,
  ReservoirUserTokensResponse,
  ReservoirUserTopOffers
} from './types';

const BASE_URL = {
  Ethereum: 'https://api.reservoir.tools/',
  Goerli: 'https://api-goerli.reservoir.tools/',
  Sepolia: 'https://api-sepolia.reservoir.tools',
  Polygon: 'https://api-polygon.reservoir.tools/',
  Mumbai: 'https://api-mumbai.reservoir.tools/',
  BNB: 'https://api-bsc.reservoir.tools/',
  Arbitrum: 'https://api-arbitrum.reservoir.tools/',
  Optimism: 'https://api-optimism.reservoir.tools/',
  ArbitrumNova: 'https://api-arbitrum-nova.reservoir.tools',
  Base: 'https://api-base.reservoir.tools',
  BaseGoerli: 'https://api-base-goerli.reservoir.tools',
  Zora: 'https://api-zora.reservoir.tools',
  ZoraGoerli: 'https://api-zora-testnet.reservoir.tools',
  ScrollAlpha: 'https://api-scroll-alpha.reservoir.tools',
  Linea: 'https://api-linea.reservoir.tools'
};

export const chainIdToNetwork: Record<number, keyof typeof BASE_URL> = {
  1: 'Ethereum',
  5: 'Goerli',
  6: 'Sepolia',
  137: 'Polygon',
  80001: 'Mumbai',
  56: 'BNB',
  42161: 'Arbitrum',
  42170: 'ArbitrumNova',
  8453: 'Base',
  84531: 'BaseGoerli',
  7777777: 'Zora',
  999: 'ZoraGoerli',
  534353: 'ScrollAlpha',
  59144: 'Linea'
};

const getBaseUrl = (chainId: number | string) => {
  chainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
  const networkName = chainIdToNetwork[chainId];
  if (!networkName) {
    return null;
  }
  return BASE_URL[networkName] || null;
};

@Injectable()
export class ReservoirService {
  private readonly client: Got;
  constructor(private configService: ConfigService<EnvironmentVariables, true>) {
    const apiKey = this.configService.get('RESERVOIR_API_KEY');
    this.client = got.extend({
      prefixUrl: 'https://api.reservoir.tools/',
      hooks: {
        beforeRequest: [
          (options) => {
            if (!options?.headers?.['x-api-key']) {
              if (!options.headers) {
                options.headers = {};
              }
              options.headers['x-api-key'] = apiKey;
            }
          }
        ]
      },
      /**
       * requires us to check status code
       */
      throwHttpErrors: false,
      cache: false,
      timeout: 20_000
    });
  }

  public async searchCollections(
    chainId: string,
    name?: string,
    collectionAddress?: string
  ): Promise<ReservoirCollectionSearch | undefined> {
    try {
      const res: Response<ReservoirCollectionSearch> = await this.errorHandler(async () => {
        const searchParams: any = {
          limit: 10
        };

        if (name) {
          searchParams.name = name;
        } else if (collectionAddress) {
          // fetch name first
          const collInfo = await this.getSingleCollectionInfo(chainId, collectionAddress);
          if (collInfo) {
            searchParams.name = collInfo.collections[0].name;
          }
        }

        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }

        return this.client.get(`search/collections/v2`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get coll search from reservoir', chainId, name, collectionAddress, e);
    }
  }

  public async getSales(
    chainId: string,
    collectionAddress: string,
    tokenId?: string,
    continuation?: string,
    sortBy?: string,
    limit?: number
  ): Promise<ReservoirSales | undefined> {
    try {
      const res: Response<ReservoirSales> = await this.errorHandler(() => {
        const searchParams: any = {
          limit: limit ?? 50,
          includeTokenMetadata: true,
          sortBy: sortBy ? sortBy : 'time'
        };

        if (tokenId) {
          searchParams.tokens = `${collectionAddress}:${tokenId}`;
        } else {
          searchParams.collection = collectionAddress;
        }

        if (continuation) {
          searchParams.continuation = continuation;
        }

        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        const endpoint = 'sales/v6';
        return this.client.get(endpoint, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const response = res.body;
      return response;
    } catch (e) {
      console.error('failed to get sales from reservoir', chainId, collectionAddress, tokenId, e);
    }
  }

  public async getOrders(
    chainId: string,
    collectionAddress?: string,
    tokenId?: string,
    continuation?: string,
    user?: string,
    side?: string,
    collBidsOnly?: boolean,
    sortBy?: string,
    limit?: number
  ): Promise<ReservoirOrders | undefined> {
    try {
      const collAddressRange = collectionAddress?.split(':');
      const isTokenRange = collAddressRange?.length === 3;

      const res: Response<ReservoirOrders> = await this.errorHandler(() => {
        const searchParams: any = {
          status: 'active',
          limit: limit ?? 50,
          includeCriteriaMetadata: true,
          sortBy: sortBy ? sortBy : 'price'
        };

        if (collectionAddress && !isTokenRange && !collBidsOnly && !tokenId) {
          searchParams.contracts = collectionAddress;
        }

        if (collectionAddress && isTokenRange && !collBidsOnly && !tokenId) {
          searchParams.tokenSetId = 'range:' + collectionAddress;
        }

        if (user) {
          searchParams.maker = user;
        }

        if (tokenId) {
          searchParams.token = `${collectionAddress}:${tokenId}`;
        }

        if (continuation) {
          searchParams.continuation = continuation;
        }

        let endpoint = 'orders/asks/v5';
        if (side === 'buy') {
          endpoint = 'orders/bids/v6';
          if (collBidsOnly) {
            searchParams.collection = collectionAddress;
          }
        }

        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(endpoint, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const response = res.body;

      // remove duplicate tokenIds when showing sell orders at a collection level
      if (!user && side === 'sell') {
        const set = new Set<string>();
        response.orders = response.orders.filter((order) => {
          const tokenId = order.criteria?.data?.token?.tokenId;
          if (set.has(tokenId)) {
            return false;
          }
          set.add(tokenId);
          return true;
        });
      }

      return response;
    } catch (e) {
      console.error('failed to get orders from reservoir', chainId, collectionAddress, tokenId, user, side, e);
    }
  }

  public async getUserTopOffers(
    chainId: string,
    user: string,
    collectionAddress?: string,
    continuation?: string
  ): Promise<ReservoirUserTopOffers | undefined> {
    try {
      const res: Response<ReservoirUserTopOffers> = await this.errorHandler(() => {
        const searchParams: any = {
          limit: 50,
          includeCriteriaMetadata: true,
          sortBy: 'topBidValue'
        };

        if (collectionAddress) {
          searchParams.collection = collectionAddress;
        }

        if (continuation) {
          searchParams.continuation = continuation;
        }

        const endpoint = `orders/users/${user}/top-bids/v4`;

        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(endpoint, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const response = res.body;
      // remove duplicate tokenIds
      const set = new Set<string>();
      response.topBids = response.topBids.filter((bid) => {
        if (set.has(bid.token.tokenId)) {
          return false;
        }
        set.add(bid.token.tokenId);
        return true;
      });

      return response;
    } catch (e) {
      console.error('failed to get user top bids from reservoir', chainId, collectionAddress, user, e);
    }
  }

  public async getOrderDepth(
    chainId: string,
    collectionAddress: string,
    side: string,
    tokenId?: string
  ): Promise<ReservoirOrderDepth | undefined> {
    try {
      const res: Response<ReservoirOrderDepth> = await this.errorHandler(() => {
        const searchParams: any = {
          side
        };

        if (tokenId) {
          searchParams.token = `${collectionAddress}:${tokenId}`;
        } else {
          searchParams.collection = collectionAddress;
        }

        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(`orders/depth/v1`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get order depth from reservoir', chainId, collectionAddress, tokenId, side, e);
    }
  }

  public async reindexCollection(chainId: string, collectionAddress: string) {
    try {
      await this.errorHandler(() => {
        const body = {
          collection: collectionAddress
        };
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.post(`collections/refresh/v1`, { json: body, responseType: 'json', prefixUrl: baseUrl });
      });
    } catch (e) {
      console.error('Failed to enqueue collection for reindexing on reservoir', chainId, collectionAddress, e);
    }
  }

  public async getTopCollsByVolume(
    chainId: string,
    sortBy: ReservoirCollsSortBy,
    limit?: number,
    continuation?: string
  ): Promise<ReservoirCollectionsV6 | undefined> {
    try {
      const res: Response<ReservoirCollectionsV6> = await this.errorHandler(() => {
        const searchParams: any = {
          includeTopBid: true,
          sortBy,
          limit: limit ?? 20
        };
        if (continuation) {
          searchParams.continuation = continuation;
        }
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(`collections/v6`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get top colls from reservoir', chainId, e);
    }
  }

  public async getSingleCollectionInfo(
    chainId: string,
    collectionAddress: string,
    slug?: string
  ): Promise<ReservoirCollectionsV6 | undefined> {
    try {
      const res: Response<ReservoirCollectionsV6> = await this.errorHandler(() => {
        let searchParams: any = {
          includeSalesCount: true
        };
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }

        if (slug) {
          if (slug === 'ens') {
            // special case
            searchParams = {
              includeSalesCount: false
            };
          }
          searchParams = {
            slug,
            ...searchParams
          };
        } else {
          searchParams = {
            id: collectionAddress,
            ...searchParams
          };
        }

        return this.client.get(`collections/v6`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get single contract info from reservoir', chainId, collectionAddress, e);
    }
  }

  public async getSingleTokenInfo(
    chainId: string,
    collectionAddress: string,
    tokenId: string
  ): Promise<ReservoirTokensResponseV6 | undefined> {
    try {
      const res: Response<ReservoirTokensResponseV6> = await this.errorHandler(() => {
        const searchParams: any = {
          tokens: `${collectionAddress}:${tokenId}`,
          includeTopBid: true,
          includeAttributes: true
        };
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(`tokens/v6`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get single token info from reservoir', chainId, collectionAddress, e);
    }
  }

  public async getDetailedTokensInfo(
    chainId: string,
    collectionAddress: string,
    continuation: string,
    limit: number
  ): Promise<ReservoirDetailedTokensResponse | undefined> {
    try {
      const res: Response<ReservoirDetailedTokensResponse> = await this.errorHandler(() => {
        const searchParams: any = {
          contract: collectionAddress,
          limit
        };
        if (continuation) {
          searchParams.continuation = continuation;
        }
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(`tokens/details/v4`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get detailed tokens info from reservoir', chainId, collectionAddress, e);
    }
  }

  public async getCollectionTopOwners(chainId: string, collectionAddress: string, offset: number, limit: number) {
    try {
      const res: Response<ReservoirTopCollectionOwnersResponse> = await this.errorHandler(() => {
        const searchParams: any = {
          contract: collectionAddress,
          offset,
          limit
        };
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }
        return this.client.get(`owners/v1`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return res.body;
    } catch (e) {
      console.error('failed to get detailed tokens info from reservoir', chainId, collectionAddress, e);
    }
  }

  public async getUserNfts(chainId: string, user: ParsedUserId, continuation: string, limit: number) {
    try {
      const res: Response<ReservoirUserTokensResponse> = await this.errorHandler(() => {
        const baseUrl = getBaseUrl(chainId);
        if (!baseUrl) {
          throw new Error(`Unsupported network ${chainId}`);
        }

        const searchParams: any = {
          limit
        };
        if (continuation) {
          searchParams.continuation = continuation;
        }
        return this.client.get(`users/${user.userAddress}/tokens/v7`, {
          searchParams,
          prefixUrl: baseUrl,
          responseType: 'json'
        });
      });

      return res.body;
    } catch (err) {
      console.error('failed to get user tokens from reservoir', chainId, user.userAddress, err);
    }
  }

  async transform(chainId: string, nfts: ReservoirUserTokensResponse['tokens']): Promise<Array<NftDto | null>> {
    return nfts.map(({ token, ownership }) => {
      const metadata = {
        name: token.name || '',
        image: token.image || '',
        attributes: []
      };
      const nft: NftDto = {
        isFlagged: false,
        collectionAddress: token.contract,
        collectionSlug: getSearchFriendlyString(token.collection.name),
        collectionName: token.collection.name,
        hasBlueCheck: false,
        chainId: chainId as ChainId,
        slug: getSearchFriendlyString(token.name || ''),
        tokenId: token.tokenId,
        minter: '',
        mintedAt: NaN,
        mintTxHash: '',
        mintPrice: NaN,
        metadata: metadata,
        numTraitTypes: metadata.attributes.length ?? 0,
        updatedAt: NaN,
        tokenUri: token.media || '',
        rarityRank: NaN,
        rarityScore: NaN,
        image: {
          url: token.image || token.media || '',
          originalUrl: token.media || token.image || '',
          updatedAt: NaN
        },
        state: undefined,
        tokenStandard: token.kind as TokenStandard
      };
      return nft;
    });
  }

  private async errorHandler<T>(request: () => Promise<Response<T>>, maxAttempts = 3): Promise<Response<T>> {
    let attempt = 0;

    for (;;) {
      attempt += 1;

      try {
        const res: Response<T> = await request();

        switch (res.statusCode) {
          case 200:
            return res;

          case 400:
            throw new Error(res.statusMessage);

          case 404:
            throw new Error('Not found');

          case 429:
            await sleep(2000);
            throw new Error('Rate limited');

          case 500:
            throw new Error('Internal server error');

          case 504:
            await sleep(5000);
            throw new Error('Reservoir down');

          default:
            await sleep(2000);
            throw new Error(`Unknown status code: ${res.statusCode}`);
        }
      } catch (err) {
        const handlerRes = gotErrorHandler(err);
        if ('retry' in handlerRes) {
          await sleep(handlerRes.delay);
        } else if (!handlerRes.fatal) {
          // unknown error
          if (attempt >= maxAttempts) {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  }
}
