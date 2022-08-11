import { CollectionPeriodStatsContent, StatsPeriod } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import {
  MnemonicNumOwnersResponseBody,
  MnemonicNumTokensResponseBody,
  MnemonicPricesByContractResponse,
  MnemonicSalesVolumeByContractResponse
} from './mnemonic.types';

type TopCollectionsApiResponse = {
  collections: CollectionPeriodStatsContent[];
};

export type mnemonicByParam = 'by_sales_volume';

@Injectable()
export class MnemonicService {
  private readonly client: AxiosInstance;

  constructor(private config: ConfigService<EnvironmentVariables, true>) {
    const apiKey = this.config.get('mnemonicApiKey');

    if (!apiKey) {
      throw new Error('Mnemonic API key is not set');
    }

    this.client = axios.create({
      headers: {
        'X-API-KEY': apiKey
      }
    });
  }

  // async getTopOwners(
  //   collectionAddress: string,
  //   options?: {
  //     limit?: number;
  //     offset?: number;
  //     orderDirection?: OrderDirection;
  //   }
  // ): Promise<TopOwnersResponseBody | null> {
  //   const sortDirection = getSortDirection(options?.orderDirection ?? OrderDirection.Descending);
  //   const limit = options?.limit ?? 50;
  //   const offset = options?.offset ?? 0;
  //   const url = new URL(
  //     `https://ethereum-analytics.rest.mnemonichq.com/collections/v1beta1/current_owners/${collectionAddress}`
  //   );
  //   url.searchParams.append('limit', limit.toString());
  //   url.searchParams.append('offset', offset.toString());
  //   url.searchParams.append('sortDirection', sortDirection);
  //   try {
  //     const response = await this.client.get(url.toString());
  //     if (response.status === 200) {
  //       return response.data as TopOwnersResponseBody;
  //     }
  //     throw new Error(`Unexpected mnemonic response status: ${response.status}`);
  //   } catch (err) {
  //     console.error(err);
  //     return null;
  //   }
  // }

  // async getUserNfts(
  //   userAddress: string,
  //   options?: {
  //     limit?: number;
  //     offset?: number;
  //     contractAddress?: string;
  //     tokenTypes?: MnemonicTokenType[];
  //   }
  // ) {
  //   const limit = options?.limit ?? 50;
  //   const offset = options?.offset ?? 0;
  //   const url = new URL(`https://canary-ethereum.rest.mnemonichq.com/tokens/v1beta1/by_owner/${userAddress}`);
  //   url.searchParams.append('limit', limit.toString());
  //   url.searchParams.append('offset', offset.toString());
  //   if (options?.contractAddress) {
  //     url.searchParams.append('contractAddress', options.contractAddress);
  //   }
  //   if (options?.tokenTypes?.length) {
  //     url.searchParams.append('tokenTypes', options.tokenTypes.join(','));
  //   }
  //   try {
  //     const response = await this.client.get(url.toString());
  //     if (response.status === 200) {
  //       return response.data as UserNftsResponseBody;
  //     }
  //     throw new Error(`Unexpected mnemonic response status: ${response.status}`);
  //   } catch (err) {
  //     console.error(err);
  //     return null;
  //   }
  // }

  // async getNft(collectionAddress: string, tokenId: string): Promise<MnemonicTokenMetadata | undefined> {
  //   const url = new URL(
  //     `https://canary-ethereum.rest.mnemonichq.com/tokens/v1beta1/token/${collectionAddress}/${tokenId}/metadata`
  //   );
  //   try {
  //     const response = await this.client.get(url.toString());
  //     if (response.status === 200) {
  //       return response.data as MnemonicTokenMetadata;
  //     }
  //     throw new Error(`Unexpected mnemonic response status: ${response.status}`);
  //   } catch (err) {
  //     console.error(err);
  //     return undefined;
  //   }
  // }

  // async getContract(collectionAddress: string): Promise<MnemonicContractDetails | undefined> {
  //   const url = new URL(
  //     `https://canary-ethereum.rest.mnemonichq.com/contracts/v1beta1/by_address/${collectionAddress}`
  //   );
  //   try {
  //     const response = await this.client.get(url.toString());
  //     if (response.status === 200) {
  //       return response.data.contract as MnemonicContractDetails;
  //     }
  //     throw new Error(`Unexpected mnemonic response status: ${response.status}`);
  //   } catch (err) {
  //     console.error(err);
  //     return undefined;
  //   }
  // }

  async getNumOwners(collectionAddress: string): Promise<MnemonicNumOwnersResponseBody | undefined> {
    const url = new URL(
      `https://ethereum-analytics.rest.mnemonichq.com/collections/v1beta1/owners_count/${collectionAddress}`
    );
    url.searchParams.append('duration', 'DURATION_1_DAY');
    url.searchParams.append('groupByPeriod', 'GROUP_BY_PERIOD_1_DAY');
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return response.data as MnemonicNumOwnersResponseBody;
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async getNumTokens(collectionAddress: string): Promise<MnemonicNumTokensResponseBody | undefined> {
    const url = new URL(
      `https://ethereum-analytics.rest.mnemonichq.com/collections/v1beta1/supply/${collectionAddress}`
    );
    url.searchParams.append('duration', 'DURATION_1_DAY');
    url.searchParams.append('groupByPeriod', 'GROUP_BY_PERIOD_1_DAY');
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return response.data as MnemonicNumTokensResponseBody;
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async getTopCollections(
    by: mnemonicByParam,
    period: StatsPeriod,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: {
      limit?: number;
      offset?: number;
      // orderDirection?: OrderDirection;
    }
  ): Promise<TopCollectionsApiResponse | null> {
    let duration = '';
    if (period === 'daily') {
      duration = 'DURATION_1_DAY';
    } else if (period === 'weekly') {
      duration = 'DURATION_7_DAYS';
    } else if (period === 'monthly') {
      duration = 'DURATION_30_DAYS';
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const url = new URL(`https://ethereum.rest.mnemonichq.com/collections/v1beta1/top/${by}?duration=${duration}`);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return response.data;
      }
      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async getPricesByContract(
    contractAddress: string,
    period: StatsPeriod
  ): Promise<MnemonicPricesByContractResponse | undefined> {
    let duration = '';
    if (period === 'daily') {
      duration = 'DURATION_1_DAY';
    } else if (period === 'weekly') {
      duration = 'DURATION_7_DAYS';
    } else if (period === 'monthly') {
      duration = 'DURATION_30_DAYS';
    }
    const GROUP_BY_PERIOD_1_DAY = 'GROUP_BY_PERIOD_1_DAY';
    const url = new URL(
      `https://ethereum.rest.mnemonichq.com/pricing/v1beta1/prices/by_contract/${contractAddress}?duration=${duration}&groupByPeriod=${GROUP_BY_PERIOD_1_DAY}`
    );
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return response.data;
      }
    } catch (err) {
      console.error('Error fetching prices by contract', err);
    }
  }

  async getSalesVolumeByContract(
    contractAddress: string,
    period: StatsPeriod
  ): Promise<MnemonicSalesVolumeByContractResponse | undefined> {
    let duration = '';
    if (period === 'daily') {
      duration = 'DURATION_1_DAY';
    } else if (period === 'weekly') {
      duration = 'DURATION_7_DAYS';
    } else if (period === 'monthly') {
      duration = 'DURATION_30_DAYS';
    }
    const GROUP_BY_PERIOD_1_DAY = 'GROUP_BY_PERIOD_1_DAY';
    const url = new URL(
      `https://ethereum.rest.mnemonichq.com/pricing/v1beta1/volumes/by_contract/${contractAddress}?duration=${duration}&groupByPeriod=${GROUP_BY_PERIOD_1_DAY}`
    );
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return response.data;
      }
    } catch (err) {
      console.error('Error fetching prices by contract', err);
    }
  }
}
