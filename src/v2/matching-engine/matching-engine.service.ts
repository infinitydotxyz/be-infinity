import { ExecutionStatus } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import got, { Got } from 'got/dist/source';
import { EnvironmentVariables } from 'types/environment-variables.interface';

@Injectable()
export class MatchingEngineService {
  protected matchingEngineApiUrl: string;
  protected matchingEngineApiKey: string;
  protected client: Got;
  constructor(_config: ConfigService<EnvironmentVariables>) {
    this.matchingEngineApiUrl = _config.get('MATCHING_ENGINE_API_URL') ?? '';
    this.matchingEngineApiKey = _config.get('MATCHING_ENGINE_API_KEY') ?? '';
    this.client = got.extend({
      prefixUrl: this.matchingEngineApiUrl,
      headers: {
        'x-api-key': this.matchingEngineApiKey
      },
      throwHttpErrors: false,
      cache: false,
      timeout: 10_000,
      responseType: 'json'
    });
  }

  async getExecutionStatuses(orderIds: string[]): Promise<ExecutionStatus[]> {
    const response = await this.client.post(`matching/orders`, {
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
}
