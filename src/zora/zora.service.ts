import { ZoraAggregateCollectionStatsResponse, ZoraTokensResponse } from '@infinityxyz/lib/types/services/zora';
import { sleep } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientError, gql, GraphQLClient } from 'graphql-request';
import { EnvironmentVariables } from 'types/environment-variables.interface';

@Injectable()
export class ZoraService {
  private readonly client: GraphQLClient;

  constructor(private configService: ConfigService<EnvironmentVariables, true>) {
    const apiKey = this.configService.get('ZORA_API_KEY');
    const ZORA_API_ENDPOINT = 'https://api.zora.co/graphql';
    this.client = new GraphQLClient(ZORA_API_ENDPOINT, {
      headers: {
        'X-API-KEY': apiKey ?? ''
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

  public async getTokens(
    chainId: string,
    collectionAddress: string,
    after: string,
    limit: number
  ): Promise<ZoraTokensResponse | undefined> {
    const numRetries = 3;
    const data = await this.tryFetchTokens(chainId, collectionAddress, after, limit, numRetries);
    return data as ZoraTokensResponse;
  }

  private async tryFetchTokens(
    chainId: string,
    collectionAddress: string,
    after: string,
    limit: number,
    numRetries: number
  ): Promise<ZoraTokensResponse | undefined> {
    if (numRetries === 0) {
      throw Error('Retries exceeded');
    }

    try {
      const query = gql`
        query MyQuery {
          tokens(where: { collectionAddresses: "${collectionAddress}"}, networks: {network: ETHEREUM, chain: MAINNET}, pagination: {after: "${after}", limit: ${limit}}, sort: {sortKey: TOKEN_ID, sortDirection: ASC}) {
            nodes {
              token {
                tokenId
                tokenUrl
                attributes {
                  displayType
                  traitType
                  value
                }
                image {
                  url
                }
                mintInfo {
                  toAddress
                  originatorAddress
                  price {
                    chainTokenPrice {
                      decimal
                      currency {
                        address
                        decimals
                        name
                      }
                    }
                  }
                  mintContext {
                    blockNumber
                    transactionHash
                    blockTimestamp
                  }
                }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
              limit
            }
          }
        }
      `;

      const data = await this.client.request(query);
      return data as ZoraTokensResponse;
    } catch (e) {
      if (e instanceof ClientError) {
        const status = e.response.status;
        if (status === 429) {
          // too many requests
          await sleep(1000);
          return this.tryFetchTokens(chainId, collectionAddress, after, limit, --numRetries);
        }
      } else {
        console.error('Failed to get tokens from zora', chainId, collectionAddress, e);
      }
    }
  }
}
