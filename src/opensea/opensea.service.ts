import { BaseCollection, ChainId, CollectionMetadata, TokenStandard } from '@infinityxyz/lib/types/core';
import { getSearchFriendlyString, sleep } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import got, { Got, Response } from 'got/dist/source';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { randomItem } from 'utils';
// import { OPENSEA_API_KEYS } from '../constants';
import { gotErrorHandler } from '../utils/got';
import {
  OpenseaAsset,
  OpenseaAssetsResponse,
  OpenseaCollection,
  OpenseaCollectionsResponse,
  OpenseaCollectionStatsResponse,
  OpenseaContract,
  OpenseaNFTMetadataResponse
} from './opensea.types';

/**
 * we try not to use Opensea more than we have to
 * prefer other methods of getting data if possible
 */
@Injectable()
export class OpenseaService {
  private readonly client: Got;
  private readonly clientNoApiKey: Got;
  private readonly OS_VERIFIED_STATUS = 'verified';

  constructor(private configService: ConfigService<EnvironmentVariables, true>) {
    const apiKeys = this.configService.get('OPENSEA_API_KEYS');
    this.client = got.extend({
      prefixUrl: 'https://api.opensea.io/api/v1/',
      hooks: {
        beforeRequest: [
          (options: any) => {
            if (!options?.headers?.['x-api-key']) {
              if (!options.headers) {
                options.headers = {};
              }

              const randomApiKey = randomItem(apiKeys);
              options.headers['x-api-key'] = randomApiKey;
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

    this.clientNoApiKey = got.extend({
      prefixUrl: 'https://api.opensea.io/api/v1/',
      /**
       * requires us to check status code
       */
      throwHttpErrors: false,
      cache: false,
      timeout: 20_000
    });
  }

  /**
   * it seems like rate limits are not an issue on this endpoint - at this time
   * (it handles ~500 requests at once using the default api key and none get rate limited)
   *
   * etherscan has a similar endpoint that seems decent if this begins to fail
   */
  async getCollectionWithAddress(chainId: ChainId, address: string): Promise<Partial<BaseCollection>> {
    if (!ethers.utils.isAddress(address)) {
      throw new Error('Invalid address');
    }

    const response = await this.errorHandler(() => {
      return this.client.get(`asset_contract/${address}`, {
        responseType: 'json'
      });
    });
    const openseaContract = response.body as OpenseaContract;
    const collection = openseaContract.collection;

    const name = collection.name || openseaContract.name;
    const hasBlueCheck = collection.safelist_request_status === this.OS_VERIFIED_STATUS;

    const dataInInfinityFormat: CollectionMetadata = {
      name,
      description: collection.description || openseaContract.description || '',
      symbol: openseaContract.symbol || collection.primary_asset_contracts?.[0]?.symbol || '',
      profileImage: collection.image_url || collection.featured_image_url || openseaContract.image_url || '',
      bannerImage: collection.banner_image_url ?? '',
      displayType: collection.display_data?.card_display_style,
      links: {
        timestamp: new Date().getTime(),
        discord: collection.discord_url ?? '',
        external: collection.external_url ?? '',
        medium:
          typeof collection?.medium_username === 'string' ? `https://medium.com/${collection.medium_username}` : '',
        slug: collection?.slug ?? '',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        telegram: collection?.telegram_url ?? '',
        twitter:
          typeof collection?.twitter_username === 'string'
            ? `https://twitter.com/${collection.twitter_username.toLowerCase()}`
            : '',
        instagram:
          typeof collection?.instagram_username === 'string'
            ? `https://instagram.com/${collection.instagram_username}`
            : '',
        wiki: collection?.wiki_url ?? ''
      }
    };

    return {
      chainId,
      address,
      tokenStandard: openseaContract.schema_name as TokenStandard,
      hasBlueCheck,
      deployer: '',
      deployedAt: NaN,
      deployedAtBlock: NaN,
      owner: '',
      numOwners: NaN,
      numOwnersUpdatedAt: NaN,
      metadata: dataInInfinityFormat,
      slug: getSearchFriendlyString(name),
      numNfts: NaN,
      numTraitTypes: NaN,
      indexInitiator: ''
    };
  }

  /**
   * getCollectionStats using the opensea slug (not the same as the infinity slug)
   */
  async getCollectionStats(slug: string): Promise<OpenseaCollectionStatsResponse> {
    const res: Response<OpenseaCollectionStatsResponse> = await this.errorHandler(() => {
      return this.client.get(`collection/${slug}/stats`, {
        responseType: 'json'
      });
    });

    const stats = res.body;

    return stats;
  }

  async getCollections(offset = 0, limit = 300): Promise<OpenseaCollection[]> {
    const res: Response<OpenseaCollectionsResponse> = await this.errorHandler(() => {
      return this.client.get(`collections`, {
        searchParams: {
          offset,
          limit
        },
        responseType: 'json'
      });
    });

    const collections = res?.body?.collections ?? [];

    return collections;
  }

  async getCollection(slug: string): Promise<OpenseaCollection> {
    const res: Response<{ collection: OpenseaCollection }> = await this.errorHandler(() => {
      return this.client.get(`collection/${slug}`, {
        responseType: 'json'
      });
    });

    const collection = res?.body?.collection ?? {};

    return collection;
  }

  async getNFT(address: string, tokenId: string): Promise<OpenseaAsset> {
    const res: Response<OpenseaAsset> = await this.errorHandler(() => {
      return this.client.get(`asset/${address}/${tokenId}`, {
        responseType: 'json'
      });
    });

    return res.body;
  }

  async getNFTMetadata(address: string, tokenId: string): Promise<OpenseaNFTMetadataResponse> {
    const res: Response<OpenseaNFTMetadataResponse> = await this.errorHandler(() => {
      return this.clientNoApiKey.get(`metadata/${address}/${tokenId}`, {
        responseType: 'json'
      });
    });

    return res.body;
  }

  async getNFTsOfContract(address: string, limit: number, cursor: string): Promise<OpenseaAssetsResponse> {
    const res: Response<OpenseaAssetsResponse> = await this.errorHandler(() => {
      const url = `assets?asset_contract_address=${address}&include_orders=false&limit=${limit}&cursor=$${cursor}`;
      return this.client.get(url, {
        responseType: 'json'
      });
    });

    return res.body;
  }

  async getGivenNFTsOfContract(address: string, tokenIds: string): Promise<OpenseaAssetsResponse> {
    const res: Response<OpenseaAssetsResponse> = await this.errorHandler(() => {
      const url = `assets?asset_contract_address=${address}&include_orders=false&${tokenIds}`;
      return this.client.get(url, {
        responseType: 'json'
      });
    });

    return res.body;
  }

  private async errorHandler<T>(request: () => Promise<Response<T>>, maxAttempts = 3): Promise<Response<T>> {
    let attempt = 0;

    for (; ;) {
      attempt += 1;

      try {
        const res: Response<T> = await request();

        switch (res.statusCode) {
          case 200:
            return res;

          case 400:
            throw new Error(res.statusMessage);

          case 404:
            attempt = maxAttempts;
            throw new Error('Not found');

          case 429:
            await sleep(2000);
            throw new Error('Rate limited');

          case 500:
            throw new Error('Internal server error');

          case 504:
            await sleep(5000);
            throw new Error('OpenSea down');

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
