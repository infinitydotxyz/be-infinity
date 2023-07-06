export interface ReservoirSales {
  sales: ReservoirSale[];
  continuation: string;
}
export interface ReservoirSale {
  chainId: string;
  id: string;
  saleId: string;
  orderId: string;
  orderSource: string;
  orderSide: string;
  orderKind: string;
  from: string; // seller
  to: string; // buyer
  fillSource: string;
  block: number;
  txHash: string;
  logIndex: number;
  batchIndex: number;
  timestamp: number; // seconds since epoch
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
  token: {
    contract: string;
    tokenId: string;
    name: string;
    image: string;
    collection: {
      id: string;
      name: string;
    };
  };
}

export interface ReservoirOrders {
  orders: ReservoirOrder[];
  continuation: string;
}

export interface ReservoirOrderDepth {
  depth: { price: number; quantity: number }[];
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
  createdAt: string;
  updatedAt: string;
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
      attribute: {
        key: string;
        value: string;
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

export interface ReservoirUserTopOffers {
  totalAmount: number;
  totalTokensWithBids: number;
  topBids: ReservoirUserTopOffer[];
  continuation: string;
}

export interface ReservoirUserTopOffer {
  id: string;
  chainId: string;
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
  maker: string;
  validFrom: number;
  validUntil: number;
  floorDifferencePercentage: number;
  criteria: {
    kind: string;
    data: {
      token: {
        tokenId: string;
        name: string;
        image: string;
      };
      collection: {
        id: string;
        name: string;
        image: string;
      };
      attribute: {
        key: string;
        value: string;
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
  token: {
    contract: string;
    tokenId: string;
    name: string;
    image: string;
    floorAskPrice: number;
    lastSalePrice: {
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
    };
    collection: {
      id: string;
      name: string;
      imageUrl: string;
      floorAskPrice: {
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
      };
    };
  };
}

export interface ReservoirTokensResponseV6 {
  tokens: ReservoirTokenV6[];
  continuation: string;
}

export interface ReservoirTokenV6 {
  token: {
    chainId: string;
    isFlagged?: boolean;
    lastFlagUpdate?: string;
    lastFlagChange?: string | null;
    contract: string;
    tokenId: string;
    name: string;
    description: string;
    image: string;
    kind: string;
    owner: string;
    collection: {
      id: string;
      name: string;
      slug: string;
      image: string;
    };
  };
  market: {
    floorAsk: ReservoirOrderData;
    topBid: ReservoirOrderData;
  };
}

export interface ReservoirOrderData {
  id: string;
  maker: string;
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
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  };
}
