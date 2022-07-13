import { ZoraAggregateCollectionStatsResponse } from '@infinityxyz/lib/types/services/zora';
import { sleep } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ClientError, gql, GraphQLClient } from 'graphql-request';
import { ZORA_API_KEY } from '../constants';

@Injectable()
export class ZoraService {
  private readonly client: GraphQLClient;

  constructor() {
    const ZORA_API_ENDPOINT = 'https://api.zora.co/graphql';
    this.client = new GraphQLClient(ZORA_API_ENDPOINT, {
      headers: {
        'X-API-KEY': ZORA_API_KEY ?? ''
      }
    });
  }

  public async getAggregatedCollectionStats(
    chainId: string,
    collectionAddress: string,
    topOwnersLimit: number
  ): Promise<ZoraAggregateCollectionStatsResponse | undefined> {
    const numRetries = 3;
    const data = await this.tryFetchStats(chainId, collectionAddress, topOwnersLimit, numRetries);
    return data as ZoraAggregateCollectionStatsResponse;
  }

  private async tryFetchStats(
    chainId: string,
    collectionAddress: string,
    topOwnersLimit: number,
    numRetries: number
  ): Promise<ZoraAggregateCollectionStatsResponse | undefined> {
    if (numRetries === 0) {
      throw Error('Retries exceeded');
    }

    try {
      const query = gql`
        query MyQuery {
          aggregateStat {
            ownerCount(where: { collectionAddresses: "${collectionAddress}" })
            ownersByCount(
              where: { collectionAddresses: "${collectionAddress}" }
              pagination: { limit: ${topOwnersLimit} }
            ) {
              nodes {
                count
                owner
              }
            }
            salesVolume(where: { collectionAddresses: "${collectionAddress}" }) {
              chainTokenPrice
              totalCount
              usdcPrice
            }
            nftCount(where: { collectionAddresses: "${collectionAddress}" })
          }
        }
      `;

      return await this.client.request(query);
    } catch (e) {
      if (e instanceof ClientError) {
        const status = e.response.status;
        if (status === 429) {
          // too many requests
          await sleep(1000);
          return this.tryFetchStats(chainId, collectionAddress, topOwnersLimit, --numRetries);
        }
      } else {
        console.error('failed to get aggregated collection stats info from zora', chainId, collectionAddress, e);
      }
    }
  }
}
