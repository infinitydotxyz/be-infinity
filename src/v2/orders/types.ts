import { ReservoirOrder } from 'reservoir/types';

export interface AggregatedOrder extends ReservoirOrder {
  lastSalePriceEth: number;
  mintPriceEth: number;
}
