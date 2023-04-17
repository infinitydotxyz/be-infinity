import { ChainId, ExecutionStatus } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import got from 'got/dist/source';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { MatchingEngineStatus } from './types';

@Injectable()
export class MatchingEngineService {
  getClient(chainId: ChainId, component: 'matchingEngine' | 'executionEngine') {
    const configureClient = (config: { baseUrl: string; apiKey: string }) => {
      if (!config.baseUrl || !config.apiKey) {
        throw new Error(`Chain ${chainId} is not supported`);
      }
      return got.extend({
        prefixUrl: config.baseUrl,
        headers: {
          'x-api-key': config.apiKey
        },
        throwHttpErrors: false,
        cache: false,
        timeout: 10_000,
        responseType: 'json'
      });
    };

    switch (component) {
      case 'matchingEngine':
        return configureClient(this.chainMatchingEngine[chainId]);
      case 'executionEngine':
        return configureClient(this.chainExecutionEngine[chainId]);
    }
  }

  protected chainMatchingEngine: Record<ChainId, { apiKey: string; baseUrl: string }>;
  protected chainExecutionEngine: Record<ChainId, { apiKey: string; baseUrl: string }>;

  protected matchingEngineApiUrl: string;
  protected matchingEngineApiKey: string;
  constructor(_config: ConfigService<EnvironmentVariables>) {
    this.chainMatchingEngine = {
      [ChainId.Goerli]: {
        apiKey: _config.get('GOERLI_MATCHING_ENGINE_API_KEY') ?? '',
        baseUrl: _config.get('GOERLI_MATCHING_ENGINE_API_URL') ?? ''
      },
      [ChainId.Mainnet]: {
        apiKey: _config.get('MAINNET_MATCHING_ENGINE_API_KEY') ?? '',
        baseUrl: _config.get('MAINNET_MATCHING_ENGINE_API_URL') ?? ''
      },
      [ChainId.Polygon]: {
        apiKey: _config.get('POLYGON_MATCHING_ENGINE_API_KEY') ?? '',
        baseUrl: _config.get('POLYGON_MATCHING_ENGINE_API_URL') ?? ''
      }
    };

    this.chainExecutionEngine = {
      [ChainId.Goerli]: {
        apiKey: _config.get('GOERLI_EXECUTION_ENGINE_API_KEY') ?? '',
        baseUrl: _config.get('GOERLI_EXECUTION_ENGINE_API_URL') ?? ''
      },
      [ChainId.Mainnet]: {
        apiKey: _config.get('MAINNET_EXECUTION_ENGINE_API_KEY') ?? '',
        baseUrl: _config.get('MAINNET_EXECUTION_ENGINE_API_URL') ?? ''
      },
      [ChainId.Polygon]: {
        apiKey: _config.get('POLYGON_EXECUTION_ENGINE_API_KEY') ?? '',
        baseUrl: _config.get('POLYGON_EXECUTION_ENGINE_API_URL') ?? ''
      }
    };
  }

  async getExecutionStatuses(chainId: ChainId, orderIds: string[]): Promise<ExecutionStatus[]> {
    const client = this.getClient(chainId, 'matchingEngine');

    const response = await client.post(`matching/orders`, {
      json: {
        orders: orderIds
      }
    });

    if (response.statusCode === 200) {
      return (response.body as any).data as ExecutionStatus[];
    } else {
      console.error(
        `Failed to get order statuses from matching engine: ${response.statusCode} - ${response.requestUrl}`
      );
      throw new Error('Failed to get order statuses');
    }
  }

  async getCollectionStatus(collection: string, chainId: ChainId): Promise<MatchingEngineStatus> {
    const client = this.getClient(chainId, 'matchingEngine');

    const response = await client.get(`matching/collection/${collection}`, {
      responseType: 'json'
    });
    if (response.statusCode === 200) {
      return response.body as MatchingEngineStatus;
    } else {
      console.error(
        `Failed to get collection status from matching engine: ${response.statusCode} - ${response.requestUrl}`
      );
      return {
        isSynced: false,
        matchingEngine: {
          healthStatus: {
            status: 'unhealthy'
          },
          jobsProcessing: 0
        },
        orderRelay: {
          healthStatus: {
            status: 'unhealthy'
          },
          jobsProcessing: 0
        },
        executionEngine: {
          healthStatus: {
            status: 'unhealthy'
          },
          jobsProcessing: 0
        },
        averages: {
          matchingEngine: {
            globalAverage: null,
            collectionAverage: null
          },
          executionEngine: {
            globalAverage: null,
            collectionAverage: null
          }
        }
      };
    }
  }
}
