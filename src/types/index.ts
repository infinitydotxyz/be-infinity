export interface UserBuyReward {
  address: string;
  baseReward: number;
  finalReward: number;
  numBuys: number;
  referralBoost: number;
  stakeBoost: number;
  volumeETH: number;
}

export interface DailyBuyTotals {
  dailyTotalNumBuys: number;
  dailyTotalVolumeETH: number;
}

export interface OverallBuyTotals {
  totalNumBuys: number;
  totalVolumeETH: number;
}

export interface SaleData {
  uniqueIdHash: string;
  txHash: string;
  buyer: string;
  seller: string;
  price: number;
  timestamp: number;
  quantity: number;
  chainId: string;
  collectionAddress: string;
  tokenId: string;
}

export interface GlobalRewards {
  totalVolumeETH: number;
  totalNumBuys: number;
  last24HrsVolumeETH: number;
  last24HrsNumBuys: number;
}
