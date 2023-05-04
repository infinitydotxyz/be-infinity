export interface UserDailyBuyReward {
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
  txHash: string;
  buyer: string;
  seller: string;
  price: number;
  timestamp: number;
  quantity: number;
}
