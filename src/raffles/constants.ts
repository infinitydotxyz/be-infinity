import { RaffleState } from '@infinityxyz/lib/types/core';
import { RaffleQueryState } from './types';

export const raffleStateByRaffleQueryState = {
  [RaffleQueryState.Active]: [RaffleState.InProgress, RaffleState.Locked, RaffleState.Finalized],
  [RaffleQueryState.Inactive]: [RaffleState.Unstarted],
  [RaffleQueryState.Complete]: [RaffleState.Completed]
};
