import { ChainId } from '@infinityxyz/lib/types/core';

export interface UserNonce {
  nonce: string;
  userAddress: string;
  chainId: ChainId;
  contractAddress: string;
  fillability: 'fillable' | 'cancelled' | 'filled';
}
