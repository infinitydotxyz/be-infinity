import { ChainId } from '@infinityxyz/lib/types/core';

export class InvalidNonceError extends Error {
  constructor(public readonly nonce: string, public readonly chainId: ChainId, reason?: string) {
    super(`Invalid nonce: ${nonce} chainId: ${chainId} ${reason ? ` reason: ${reason}` : ''}`);
  }
}
