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
      timeout: 10_000
    });
  }

  async getOrderStatuses(orderIds: string[]) {
    const response = await this.client.get(`orders`, {
      json: {
        orders: orderIds
      }
    });

    if (response.statusCode === 200) {
      return (response.body as any).data;
    } else {
      console.error(
        `Failed to get order statuses from matching engine: ${response.statusCode} - ${response.requestUrl}`
      );
      throw new Error('Failed to get order statuses');
    }
  }
}

export interface NotFoundOrder {
  id: string;
  orderStatus: 'not-found';
}

export interface ActiveOrderPendingMatch {
  id: string;
  orderStatus: 'active';
  matchStatus: 'pending';
}

export interface MatchOperationMetadata {
  validMatches: number;
  matchLimit: number;
  matchIds: string[];
  side: 'proposer' | 'recipient';
  timing: {
    proposerInitiatedAt: number;
    matchedAt: number;
    matchDuration: number;
  };
}

export interface Block {
  timestamp: number;
  number: number;
  baseFeePerGas: string;
}

export interface BlockWithMaxFeePerGas extends Block {
  maxFeePerGas: string;
}

export interface BlockWithGas extends BlockWithMaxFeePerGas {
  maxPriorityFeePerGas: string;
}

export interface BaseExecutionOrder {
  matchId: string;
  matchedOrderId: string;
  block: BlockWithGas;
}

export interface PendingExecutionOrder extends BaseExecutionOrder {
  status: 'pending';
  timing: {
    initiatedAt: number;
  };
}

export interface InexecutableExecutionOrder extends BaseExecutionOrder {
  status: 'inexecutable';
  reason: string;
  timing: {
    initiatedAt: number;
  };
}

export interface NotIncludedExecutionOrder extends BaseExecutionOrder {
  status: 'not-included';
  effectiveGasPrice: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  timing: {
    initiatedAt: number;
    receiptReceivedAt: number;
  };
}

export interface ExecutedExecutionOrder extends BaseExecutionOrder {
  status: 'executed';
  effectiveGasPrice: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  txHash: string;
  timing: {
    initiatedAt: number;
    blockTimestamp: number;
    receiptReceivedAt: number;
  };
}

export type ExecutionOrder =
  | PendingExecutionOrder
  | InexecutableExecutionOrder
  | NotIncludedExecutionOrder
  | ExecutedExecutionOrder;

export interface ActiveOrderMatchedPendingExecution {
  id: string;
  orderStatus: 'active';
  matchStatus: 'matched';
  matchOperationMetadata: MatchOperationMetadata;
  executionStatus: 'pending';
  executionInfo: InexecutableExecutionOrder | null;
}

export interface ActiveOrderMatchedExecuting {
  id: string;
  orderStatus: 'active';
  matchStatus: 'matched';
  matchOperationMetadata: MatchOperationMetadata;
  executionStatus: 'executing';
  executionInfo: PendingExecutionOrder | NotIncludedExecutionOrder;
}

export interface ActiveOrderMatchedExecuted {
  id: string;
  orderStatus: 'executed';
  matchStatus: 'matched';
  matchOperationMetadata: MatchOperationMetadata;
  executionStatus: 'executed';
  executionInfo: ExecutedExecutionOrder;
}

export type OrderState =
  | NotFoundOrder
  | ActiveOrderPendingMatch
  | ActiveOrderMatchedPendingExecution
  | ActiveOrderMatchedExecuting
  | ActiveOrderMatchedExecuted;
