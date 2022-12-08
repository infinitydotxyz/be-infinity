import {
  ChainId,
  ChainOBOrder,
  CollectionDisplayData,
  TokenStandard,
  UserDisplayData
} from '@infinityxyz/lib/types/core';

export interface BaseRawOrder {
  id: string;
  chainId: ChainId;
  updatedAt: number;
  isSellOrder: boolean;
  createdAt: number;
}

export type OrderStatus = 'active' | 'inactive' | 'expired' | 'cancelled' | 'filled';

export type OrderSource =
  | 'wyvern-v2'
  | 'wyvern-v2.3'
  | 'looks-rare'
  | 'zeroex-v4-erc721'
  | 'zeroex-v4-erc1155'
  | 'foundation'
  | 'x2y2'
  | 'seaport'
  | 'rarible'
  | 'element-erc721'
  | 'element-erc1155'
  | 'quixotic'
  | 'nouns'
  | 'zora-v3'
  | 'mint'
  | 'cryptopunks'
  | 'sudoswap'
  | 'universe'
  | 'nftx'
  | 'blur'
  | 'infinity'
  | 'forward';

export interface RawOrderWithoutError extends BaseRawOrder {
  source: OrderSource;
  rawOrder: any;
  infinityOrderId: string;
  infinityOrder: ChainOBOrder;
  gasUsage: string;
  isDynamic: boolean;
}

export interface OrderError {
  errorCode: number;
  value: string;
  source: OrderSource | 'unknown';
  type: 'unsupported' | 'unexpected';
}

export interface RawOrderWithError extends BaseRawOrder {
  error: OrderError;
}

export type RawOrder = RawOrderWithError | RawOrderWithoutError;

export type TokenKind = 'single-token' | 'token-list' | 'collection-wide';
export type CollectionKind = 'single-collection' | 'multi-collection';

export interface OrderKind {
  collectionKind: CollectionKind;

  isSubSetOrder: boolean;

  numItems: number;

  numTokens: number;
  numCollections: number;

  isDynamic: boolean;
  isPrivate: boolean;
}

export interface QueryableOrder {
  isSellOrder: boolean;
  /**
   * start times
   */
  startTime: number;
  endTime: number;
  startTimeMs: number;
  endTimeMs: number;

  maker: string;
  taker: string;

  numItems: number;

  currency: string;

  /**
   * base prices - does not include additional costs
   * needed to execute order
   */
  startPrice: string;
  endPrice: string;

  startPriceEth: number;
  endPriceEth: number;
  startPricePerItem: string;
  startPricePerItemEth: number;
  endPricePerItem: string;
  endPricePerItemEth: number;

  /**
   * gas to fulfill the order
   */
  gasUsageString: string;
  gasUsage: number;

  nonce: string;

  /**
   * gas to fulfill order on infinity
   */
  maxGasPrice: string;
  maxGasPriceGwei: number;
  maxGasPriceEth: number;

  /**
   * whether every item in the order has a blue check
   */
  hasBlueCheck: boolean;

  complication: string;

  sourceMarketplace: OrderSource;

  orderKind: OrderKind;

  status: OrderStatus;
  /**
   * is true if the order is `active` or `inactive`
   */
  isValid: boolean;
}

export interface BaseRawFirestoreOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: OrderSource;
    updatedAt: number;
    createdAt: number;
    hasError: boolean;
  };
  error?: OrderError;

  rawOrder?: RawOrder;

  order?: QueryableOrder;
}

export interface RawFirestoreOrderWithError {
  metadata: {
    id: string;
    chainId: ChainId;
    source: OrderSource;
    updatedAt: number;
    createdAt: number;
    hasError: true;
  };
  error: OrderError;

  rawOrder?: RawOrder;

  order?: QueryableOrder;
}

export interface RawFirestoreOrderWithoutError {
  metadata: {
    id: string;
    chainId: ChainId;
    source: OrderSource;
    updatedAt: number;
    createdAt: number;
    hasError: false;
  };

  rawOrder: RawOrderWithoutError;

  order: QueryableOrder;
}

export type RawFirestoreOrder = RawFirestoreOrderWithError | RawFirestoreOrderWithoutError;

export interface BaseFirestoreOrderItem {
  chainId: ChainId;
  address: string;
  hasBlueCheck: boolean;
  slug: string;
  name: string;
  profileImage: string;
  bannerImage: string;
  tokenStandard: TokenStandard;
  kind: TokenKind;
}

export interface OrderItemToken {
  tokenId: string;
  name: string;
  numTraitTypes: number;
  image: string;
  tokenStandard: TokenStandard;
  quantity: number;
}
export interface SingleTokenOrderItem extends BaseFirestoreOrderItem {
  kind: 'single-token';
  token: OrderItemToken;
}

export interface TokenListOrderItem extends BaseFirestoreOrderItem {
  kind: 'token-list';
  tokens: OrderItemToken[];
}

export interface CollectionWideOrderItem extends BaseFirestoreOrderItem {
  kind: 'collection-wide';
}

export type OrderItem = CollectionWideOrderItem | SingleTokenOrderItem | TokenListOrderItem;
export interface FirestoreOrderCollection {
  collection: CollectionDisplayData;
  tokens: {
    hasBlueCheck: boolean;
    tokenId: string;
    name: string;
    numTraitTypes: number;
    image: string;
    tokenStandard: TokenStandard;
    numTokens: number;
  }[];
}

export interface BaseDisplayOrder {
  kind: CollectionKind;

  maker: UserDisplayData;
}

export interface SingleCollectionDisplayOrder extends BaseDisplayOrder {
  kind: 'single-collection';
  item: OrderItem;
}

export interface MultiCollectionDisplayOrder extends BaseDisplayOrder {
  kind: 'multi-collection';
  items: OrderItem[];
}

export type DisplayOrder = SingleCollectionDisplayOrder | MultiCollectionDisplayOrder;

export interface BaseFirestoreDisplayOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: OrderSource;
    updatedAt: number;
    createdAt: number;
    hasError: boolean;
  };
  error?: OrderError;

  order?: QueryableOrder;

  displayOrder?: DisplayOrder;
}

export interface FirestoreDisplayOrderWithError extends BaseFirestoreDisplayOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: OrderSource;
    updatedAt: number;
    createdAt: number;
    hasError: true;
  };
  error: OrderError;
}

export interface FirestoreDisplayOrderWithoutError extends BaseFirestoreDisplayOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: OrderSource;
    updatedAt: number;
    createdAt: number;
    hasError: false;
  };
  order: QueryableOrder;
  displayOrder: DisplayOrder;
}

export type FirestoreDisplayOrder = FirestoreDisplayOrderWithError | FirestoreDisplayOrderWithoutError;

export enum OrderEventKind {
  Created = 'CREATED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
  Sale = 'SALE',
  BalanceChange = 'BALANCE_CHANGE',
  ApprovalChange = 'APPROVAL_CHANGE',
  Bootstrap = 'BOOTSTRAP',
  Revalidation = 'REVALIDATION',
  PriceUpdate = 'PRICE_UPDATE'
}

export interface OrderEventMetadata {
  id: string;
  isSellOrder: boolean;
  orderId: string;
  chainId: ChainId;
  processed: boolean;
  migrationId: 1;
  eventKind: OrderEventKind;
  timestamp: number;
  updatedAt: number;
  eventSource: 'reservoir' | 'infinity-orderbook';
}

export interface BaseOrderEvent {
  metadata: OrderEventMetadata;
}

type SpecificOrderEventKind<T extends OrderEventKind> = Omit<OrderEventMetadata, 'eventKind'> & {
  eventKind: T;
};

export interface OrderCreatedEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Created>;

  data: {
    /**
     * an order is native if the original source is infinity
     *
     * orders that are not native are those created to
     * match other marketplace orders
     */
    isNative: boolean;
    order: RawOrder;
    status: OrderStatus;
  };
}
