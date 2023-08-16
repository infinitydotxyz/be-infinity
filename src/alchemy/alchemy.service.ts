import { ChainId } from '@infinityxyz/lib/types/core';
import { UserCollectionsQuery } from '@infinityxyz/lib/types/dto';
import {
  AlchemyFloorPriceResponse,
  AlchemyNftWithMetadata,
  AlchemyUserCollectionsResponse,
  AlchemyUserNftsResponse
} from '@infinityxyz/lib/types/services/alchemy';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import axios, { AxiosInstance } from 'axios';
import { normalize } from 'path';
import { EnvironmentVariables } from 'types/environment-variables.interface';

@Injectable()
export class AlchemyService {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  private getBaseUrl(chainId: ChainId | string, path: string, api?: 'nft') {
    switch (chainId) {
      case ChainId.Mainnet:
        if (api) {
          return new URL(normalize(`https://eth-mainnet.g.alchemy.com/${api}/v2/${this.apiKey}/${path}`));
        }
        return new URL(normalize(`https://eth-mainnet.alchemyapi.io/v2/${this.apiKey}/${path}`));
      case ChainId.Goerli:
        return new URL(normalize(`https://eth-goerli.alchemyapi.io/v2/${this.apiKey}/${path}`));
      case ChainId.Polygon:
        return new URL(normalize(`https://polygon-mainnet.g.alchemyapi.io/v2/${this.apiKey}/${path}`));

      default:
        throw new Error(`Unsupported chainId: ${chainId}`);
    }
  }

  constructor(private config: ConfigService<EnvironmentVariables, true>) {
    this.apiKey = this.config.get('ALCHEMY_API_KEY');
    this.client = axios.create();
  }

  async getUserCollections(
    owner: string,
    chainId: string,
    query: UserCollectionsQuery
  ): Promise<AlchemyUserCollectionsResponse | undefined> {
    const url = this.getBaseUrl(chainId, 'getContractsForOwner', 'nft');
    try {
      // const excludeFilters = [];
      // if (query.hideSpam) {
      //   excludeFilters.push('SPAM');
      // }
      // if (query.hideAirdrops) {
      //   excludeFilters.push('AIRDROPS');
      // }
      // const serializedExcludeFilters = alchemyParamSerializer({ 'excludeFilters[]': excludeFilters });

      const response = await this.client.get(url.toString(), {
        params: {
          owner: owner,
          withMetadata: 'true',
          pageSize: query.limit ?? 20,
          ...(query.orderBy ? { orderBy: query.orderBy } : { orderBy: 'transferTime' }),
          ...(query.cursor ? { pageKey: query.cursor } : {}),
          ...(query.hideSpam ? { 'excludeFilters[]': 'SPAM' } : {})
        }
      });
      const data = response.data as AlchemyUserCollectionsResponse;

      if (!data) {
        throw new Error('No data returned from alchemy');
      }

      return data;
    } catch (err) {
      console.error('failed to get user collections from alchemy', err);
    }
  }

  async getUserNfts(
    owner: string,
    chainId: ChainId,
    cursor: string,
    contractAddresses: string[],
    query: UserCollectionsQuery
  ): Promise<AlchemyUserNftsResponse | undefined> {
    const url = this.getBaseUrl(chainId, 'getNFTs', 'nft');
    try {
      const shouldOrderBy = query.orderBy && contractAddresses.length === 0;
      const response = await this.client.get(url.toString(), {
        params: {
          owner: owner,
          withMetadata: 'true',
          pageSize: query.limit ?? 50,
          ...(shouldOrderBy ? { orderBy: query.orderBy } : {}),
          ...(cursor ? { pageKey: cursor } : {}),
          ...(contractAddresses && contractAddresses?.length > 0 ? { contractAddresses } : {}),
          ...(query.hideSpam ? { 'excludeFilters[]': 'SPAM' } : {})
        }
      });
      const data = response.data as AlchemyUserNftsResponse;

      if (!data) {
        throw new Error('No data returned from alchemy');
      }

      return data;
    } catch (err) {
      console.error('failed to get user nfts from alchemy', err);
    }
  }

  async getNft(
    chainId: ChainId | string,
    collectionAddress: string,
    tokenId: string
  ): Promise<AlchemyNftWithMetadata | undefined> {
    const url = this.getBaseUrl(chainId, '/getNFTMetadata');
    try {
      const response = await this.client.get(url.toString(), {
        params: {
          contractAddress: collectionAddress,
          tokenId
        }
      });
      const data = response.data as AlchemyNftWithMetadata;

      if (!data) {
        throw new Error('No data returned from alchemy');
      }
      return data;
    } catch (err) {
      console.error('failed to get user nfts from alchemy', err);
      return undefined;
    }
  }

  async getFloorPrice(chainId: ChainId, collectionAddress: string): Promise<number | null> {
    const url = this.getBaseUrl(chainId, '/getFloorPrice', 'nft');

    if (chainId !== ChainId.Mainnet) {
      throw new Error(`Unsupported chainId: ${chainId}`);
    }

    try {
      const response = await this.client.get(url.toString(), {
        params: {
          contractAddress: collectionAddress
        }
      });
      const data = response.data as AlchemyFloorPriceResponse;

      if (typeof data?.openSea?.floorPrice === 'number') {
        return data.openSea.floorPrice;
      } else if (typeof data?.looksRare?.floorPrice === 'number') {
        return data.looksRare.floorPrice;
      }

      console.error('failed to get floor price from alchemy', data);
      return null;
    } catch (err) {
      console.error('failed to get floor price from alchemy', err);
      return null;
    }
  }
}
