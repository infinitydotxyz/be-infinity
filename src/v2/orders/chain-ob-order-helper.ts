import { ChainId, ChainOBOrder } from '@infinityxyz/lib/types/core';
import { formatEth } from '@infinityxyz/lib/utils';
import { Flow } from '@reservoir0x/sdk';

/**
 * ChainOBOrderHelper normalizes order data, and
 * provides methods to verify the signature and fillability
 */
export class ChainOBOrderHelper extends Flow.Order {
  constructor(chainId: ChainId, order: ChainOBOrder) {
    const constraints = order.constraints.map((item) => item.toString());
    super(parseInt(chainId, 10), { ...order, constraints });
    if (order.sig) {
      this.sig = order.sig;
    }
  }

  async isSigValid() {
    try {
      await this.checkSignature();
      return true;
    } catch (err) {
      return false;
    }
  }

  get startPriceEth() {
    return formatEth(this.startPrice, 6);
  }

  get endPriceEth() {
    return formatEth(this.endPrice, 6);
  }

  get startTimeMs() {
    return this.startTime * 1000;
  }

  get endTimeMs() {
    return this.endTime * 1000;
  }
}
