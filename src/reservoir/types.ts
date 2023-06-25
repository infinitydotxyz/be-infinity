export interface ReservoirOrders {
  orders: ReservoirOrder[];
  continuation: string;
}

export interface ReservoirOrder {
  id: string;
  kind: string;
  side: string;
  status: string;
  tokenSetId: string;
  chainId: string;
  contract: string;
  maker: string;
  taker: string;
  validFrom: number;
  validUntil: number;
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    };
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
    netAmount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
  };
  criteria: {
    kind: string;
    data: {
      token: {
        tokenId: string;
        name: string;
        image: string;
      };
      collection: {
        tokenId: string;
        name: string;
        image: string;
      };
    };
  };
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  };
}
