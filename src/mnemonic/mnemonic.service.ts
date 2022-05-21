import { OrderDirection } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { plainToClass } from 'class-transformer';
import { getSortDirection } from './mnemonic.constants';
import {
  MnemonicContractDetails,
  MnemonicTokenMetadata,
  MnemonicTokenType,
  MnemonicNumOwnersResponseBody,
  TopOwnersResponseBody,
  UserNftsResponseBody,
  MnemonicNumTokensResponseBody
} from './mnemonic.types';

@Injectable()
export class MnemonicService {
  private readonly client: AxiosInstance;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('mnemonicApiKey');

    if (!apiKey) {
      throw new Error('Mnemonic API key is not set');
    }

    this.client = axios.create({
      headers: {
        'X-API-KEY': apiKey
      }
    });
  }

  async getTopOwners(
    collectionAddress: string,
    options?: {
      limit?: number;
      offset?: number;
      orderDirection?: OrderDirection;
    }
  ): Promise<TopOwnersResponseBody | null> {
    const sortDirection = getSortDirection(options?.orderDirection ?? OrderDirection.Descending);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const url = new URL(
      `https://ethereum-analytics.rest.mnemonichq.com/collections/v1beta1/current_owners/${collectionAddress}`
    );
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    url.searchParams.append('sortDirection', sortDirection);
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return plainToClass(TopOwnersResponseBody, response.data);
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async getUserNfts(
    userAddress: string,
    options?: {
      limit?: number;
      offset?: number;
      contractAddress?: string;
      tokenTypes?: MnemonicTokenType[];
    }
  ) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const url = new URL(`https://canary-ethereum.rest.mnemonichq.com/tokens/v1beta1/by_owner/${userAddress}`);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    if (options?.contractAddress) {
      url.searchParams.append('contractAddress', options.contractAddress);
    }
    if (options?.tokenTypes?.length) {
      url.searchParams.append('tokenTypes', options.tokenTypes.join(','));
    }
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return plainToClass(UserNftsResponseBody, response.data);
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async getNft(collectionAddress: string, tokenId: string): Promise<MnemonicTokenMetadata | undefined> {
    const url = new URL(
      `https://canary-ethereum.rest.mnemonichq.com/tokens/v1beta1/token/${collectionAddress}/${tokenId}/metadata`
    );
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return plainToClass(MnemonicTokenMetadata, response.data);
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async getContract(collectionAddress: string): Promise<MnemonicContractDetails | undefined> {
    const url = new URL(
      `https://canary-ethereum.rest.mnemonichq.com/contracts/v1beta1/by_address/${collectionAddress}`
    );
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return plainToClass(MnemonicContractDetails, response.data);
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async getNumOwners(collectionAddress: string): Promise<MnemonicNumOwnersResponseBody | undefined> {
    const url = new URL(
      `https://canary-ethereum.rest.mnemonichq.com/contracts/v1beta1/owners_count/${collectionAddress}`
    );
    url.searchParams.append('duration', 'DURATION_1_DAY');
    url.searchParams.append('groupByPeriod', 'GROUP_BY_PERIOD_1_DAY');
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return plainToClass(MnemonicNumOwnersResponseBody, response.data);
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async getNumTokens(collectionAddress: string): Promise<MnemonicNumTokensResponseBody | undefined> {
    const url = new URL(
      `https://canary-ethereum.rest.mnemonichq.com/contracts/v1beta1/supply/${collectionAddress}`
    );
    url.searchParams.append('duration', 'DURATION_1_DAY');
    url.searchParams.append('groupByPeriod', 'GROUP_BY_PERIOD_1_DAY');
    try {
      const response = await this.client.get(url.toString());
      if (response.status === 200) {
        return plainToClass(MnemonicNumTokensResponseBody, response.data);
      }
      throw new Error(`Unexpected mnemonic response status: ${response.status}`);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }
}
