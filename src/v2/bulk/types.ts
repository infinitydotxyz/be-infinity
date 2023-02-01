import { ChainId, ChainOBOrder, OrderSource } from '@infinityxyz/lib/types/core';

export interface SnapshotMetadata {
  bucket: string;
  file: string;
  chainId: ChainId;
  numOrders: number;
  timestamp: number;
}

export interface OrderbookSnapshotOrder {
  id: string;
  order: ChainOBOrder;
  source: OrderSource;
  sourceOrder: unknown;
  gasUsage: string;
}
