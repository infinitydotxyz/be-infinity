import {
  ChainId,
  ChainNFTs,
  CurrencyAllowanceRequest,
  DepositCurrencyRequest,
  EIP721Data,
  RawOrderWithoutError,
  RequestKind,
  SignatureRequest,
  SignerRequests,
  TokenApprovalRequest
} from '@infinityxyz/lib/types/core';
import {
  GenerateParams,
  GenerateOrderKind,
  GenerateOrderParams,
  GenerateBuyParams,
  GenerateSellParams
} from '@infinityxyz/lib/types/dto';
import { formatEth, ONE_MIN, ONE_WEEK, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { Flow } from '@reservoir0x/sdk';
import { ContractService } from 'ethereum/contract.service';
import { Erc20 } from 'ethereum/contracts/erc20';
import { Erc721 } from 'ethereum/contracts/erc721';
import { EthereumService } from 'ethereum/ethereum.service';
import { constants } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { NonceService } from 'v2/orders/nonce/nonce.service';
import { ProtocolOrdersService } from 'v2/orders/protocol-orders/protocol-orders.service';
import { bn } from 'utils';
import { GenerateOrderError } from './generate-order-error';

@Injectable()
export class GenerateOrderService {
  /**
   * Buyer always pays gas fees
   */
  protected readonly _defaultListingGasPrice = '0';
  protected readonly _defaultOfferGasPrice = parseUnits('15', 'gwei').toString();

  protected readonly _defaultInstantOrderDurationSeconds = ONE_MIN * 5;
  protected readonly _defaultOrderDurationSeconds = ONE_WEEK;

  constructor(
    protected _nonceService: NonceService,
    protected _ethereumService: EthereumService,
    protected _contractService: ContractService,
    protected _protocolOrdersService: ProtocolOrdersService
  ) {}

  async generateOrder(params: GenerateParams): Promise<SignerRequests> {
    switch (params.kind) {
      case GenerateOrderKind.Sell:
        return await this.generateSell(params);
      case GenerateOrderKind.Buy:
        return await this.generateBuy(params);
      case GenerateOrderKind.Bid:
        return await this.generateBid(params);
      case GenerateOrderKind.List:
        return await this.generateListing(params);
      default: {
        throw new GenerateOrderError(`Invalid order kind: ${(params as any)?.kind}`);
      }
    }
  }

  async generateBid(params: GenerateOrderParams) {
    let nonce = params.nonce;
    if (!nonce) {
      const result = await this._nonceService.getNonce(params.maker, params.chainId);
      nonce = result.toString();
    }

    const input: Flow.Types.OrderInput = {
      isSellOrder: false,
      signer: trimLowerCase(params.maker),
      numItems: params.numItems,
      startPrice: params.startPriceWei,
      endPrice: params.endPriceWei,
      startTime: params.startTimeMs,
      endTime: params.endTimeMs,
      nonce: nonce,
      maxGasPrice: this._defaultOfferGasPrice,
      nfts: params.nfts,
      currency: trimLowerCase(params.currency),
      complication: this._contractService.getComplicationAddress(params.chainId),
      extraParams: constants.HashZero,
      trustedExecution: '0'
    };

    const order = new Flow.Order(parseInt(params.chainId, 10), input);

    return await this._getBuyOrderGenerateRequests(params.chainId, order);
  }

  async generateBuy(params: GenerateBuyParams) {
    let nonce = params.nonce;
    if (!nonce) {
      const result = await this._nonceService.getNonce(params.maker, params.chainId);
      nonce = result.toString();
    }

    const oppositeOrder = await this._protocolOrdersService.getOrderById(params.orderId);

    if (!oppositeOrder) {
      throw new GenerateOrderError('Order not found');
    }

    const { order } = this._getMatchingOrder(
      {
        chainId: params.chainId,
        signer: params.maker,
        nonce
      },
      oppositeOrder,
      {
        maxPriceWei: params.maxPriceWei,
        maxGasPriceWei: params.maxGasPriceWei || this._defaultOfferGasPrice,
        nfts: params.nfts
      }
    );

    if (order.isSellOrder) {
      throw new GenerateOrderError('Attempted to generate buy order for another buy order');
    }

    return await this._getBuyOrderGenerateRequests(params.chainId, order);
  }

  async generateSell(params: GenerateSellParams) {
    let nonce = params.nonce;
    if (!nonce) {
      const result = await this._nonceService.getNonce(params.maker, params.chainId);
      nonce = result.toString();
    }

    const oppositeOrder = await this._protocolOrdersService.getOrderById(params.orderId);

    if (!oppositeOrder) {
      throw new GenerateOrderError('Order not found');
    }

    const { order } = this._getMatchingOrder(
      {
        chainId: params.chainId,
        signer: params.maker,
        nonce
      },
      oppositeOrder,
      {
        minPriceWei: params.minPriceWei,
        maxGasPriceWei: '0',
        nfts: params.nfts
      }
    );

    if (!order.isSellOrder) {
      throw new GenerateOrderError('Attempted to generate sell order for another sell order');
    }

    return await this._getSellOrderRequests(params.chainId, order);
  }

  /**
   * generate a listing
   */
  async generateListing(params: GenerateOrderParams) {
    let nonce = params.nonce;
    if (!nonce) {
      const result = await this._nonceService.getNonce(params.maker, params.chainId);
      nonce = result.toString();
    }

    const input: Flow.Types.OrderInput = {
      isSellOrder: true,
      signer: trimLowerCase(params.maker),
      numItems: params.numItems,
      startPrice: params.startPriceWei,
      endPrice: params.endPriceWei,
      startTime: params.startTimeMs,
      endTime: params.endTimeMs,
      nonce: nonce,
      maxGasPrice: this._defaultListingGasPrice,
      nfts: params.nfts,
      currency: trimLowerCase(params.currency),
      complication: this._contractService.getComplicationAddress(params.chainId),
      extraParams: constants.HashZero,
      trustedExecution: '0'
    };

    const order = new Flow.Order(parseInt(params.chainId, 10), input);
    return await this._getSellOrderRequests(params.chainId, order);
  }

  protected async _getBuyOrderGenerateRequests(chainId: ChainId, order: Flow.Order) {
    const nftApprovals: TokenApprovalRequest[] = [];

    const currencyAddress = order.currency;

    if (currencyAddress === constants.AddressZero) {
      throw new GenerateOrderError('Cannot use ETH');
    }
    const provider = this._ethereumService.getProvider(chainId);
    const currency = new Erc20(provider, currencyAddress);
    const exchange = this._contractService.getExchangeAddress(chainId);

    const allowance = await currency.getAllowance(order.signer, exchange);
    const balance = await currency.getBalance(order.signer);
    const price = bn(order.startPrice).gt(order.endPrice) ? bn(order.startPrice) : bn(order.endPrice);

    const currencyApprovals: CurrencyAllowanceRequest[] = [];
    if (allowance.lt(price)) {
      currencyApprovals.push({
        kind: RequestKind.CurrencyAllowance,
        status: 'incomplete',
        message: "Approve exchange to spend WETH - you'll only need to do this once",
        txData: currency.approveTransaction(order.signer, exchange)
      });
    } else {
      currencyApprovals.push({
        kind: RequestKind.CurrencyAllowance,
        status: 'complete',
        message: "Approve exchange to spend WETH - you'll only need to do this once"
      });
    }

    const currencyDeposits: DepositCurrencyRequest[] = [];
    if (balance.lt(price)) {
      const difference = price.sub(balance);
      currencyDeposits.push({
        kind: RequestKind.DepositCurrency,
        status: 'incomplete',
        message: `You do not have enough WETH to cover the order. Deposit ${formatEth(difference.toString(), 6)} WETH`
      });
    }

    const signatureData = order.getSignatureData();
    const signatureRequest: SignatureRequest = {
      kind: RequestKind.Signature,
      status: 'incomplete',
      message: 'Sign the order to bid on NFTs on the Infinity marketplace',
      signatureData: {
        signatureKind: signatureData.signatureKind as 'eip712',
        domain: signatureData.domain as EIP721Data['domain'],
        types: signatureData.type,
        value: signatureData.value
      }
    };

    return {
      nftApprovals,
      currencyApprovals,
      currencyDeposits,
      signatureRequests: [signatureRequest]
    };
  }

  protected async _getSellOrderRequests(chainId: ChainId, order: Flow.Order): Promise<SignerRequests> {
    const nftApprovals = await this._getNftApprovals(chainId, order.signer, order.nfts);

    const currencyApprovals: CurrencyAllowanceRequest[] = [];
    const currencyDeposits: DepositCurrencyRequest[] = [];

    const signatureData = order.getSignatureData();
    const signatureRequest: SignatureRequest = {
      kind: RequestKind.Signature,
      status: 'incomplete',
      message: 'Sign the order to list your NFTs on the Infinity marketplace',
      signatureData: {
        signatureKind: signatureData.signatureKind as 'eip712',
        domain: signatureData.domain as EIP721Data['domain'],
        types: signatureData.type,
        value: signatureData.value
      }
    };

    return {
      nftApprovals,
      currencyApprovals,
      currencyDeposits,
      signatureRequests: [signatureRequest]
    };
  }

  protected _getMatchingOrder(
    params: { chainId: ChainId; signer: string; nonce: string },
    opposingRawOrder: RawOrderWithoutError,
    options: {
      maxGasPriceWei: string;
      minPriceWei?: string;
      maxPriceWei?: string;
      nfts?: ChainNFTs[];
    }
  ) {
    const opposingChainOBOrder = opposingRawOrder.infinityOrder;
    const isMatchExecutor = opposingChainOBOrder.signer === constants.AddressZero;
    let opposingInternalOrder: Flow.Types.InternalOrder | Flow.Types.SignedOrder = {
      isSellOrder: opposingChainOBOrder.isSellOrder,
      signer: opposingChainOBOrder.signer,
      constraints: opposingChainOBOrder.constraints.map((item) => bn(item).toString()),
      nfts: opposingChainOBOrder.nfts,
      execParams: opposingChainOBOrder.execParams,
      extraParams: opposingChainOBOrder.extraParams
    };

    /**
     * match executor orders are not signed yet
     */
    if (!isMatchExecutor) {
      opposingInternalOrder = {
        ...opposingInternalOrder,
        sig: opposingChainOBOrder.sig
      };
    }

    const chainId = parseInt(params.chainId, 10);
    const opposingOrder = new Flow.Order(chainId, opposingInternalOrder);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentPrice = bn(opposingOrder.getMatchingPrice(nowSeconds));

    const isOpposingPriceDecreasing = bn(opposingOrder.startPrice).lt(opposingOrder.endPrice);
    const isOpposingPriceIncreasing = bn(opposingOrder.startPrice).gt(opposingOrder.endPrice);

    if (isOpposingPriceDecreasing || isOpposingPriceIncreasing) {
      // TODO support dynamic orders
      throw new GenerateOrderError('Dynamic price orders are not yet supported');
    }

    if (options.minPriceWei && currentPrice.lt(options.minPriceWei)) {
      throw new GenerateOrderError('Min price is too high');
    }

    if (options.maxPriceWei && currentPrice.gt(options.maxPriceWei)) {
      throw new GenerateOrderError('Max price is too low');
    }
    const isSellOrder = !opposingOrder.isSellOrder;
    const endTime = nowSeconds + this._defaultInstantOrderDurationSeconds;

    // TODO for instant offers should we base this off of the current gas price?
    const maxGasPriceWei = options.maxGasPriceWei;

    const orderInput: Flow.Types.OrderInput = {
      isSellOrder,
      signer: params.signer,
      numItems: opposingOrder.numItems,
      startPrice: opposingOrder.startPrice,
      endPrice: opposingOrder.endPrice,
      startTime: nowSeconds,
      endTime: endTime,
      nonce: params.nonce,
      maxGasPrice: maxGasPriceWei,
      nfts: [],
      complication: this._contractService.getComplicationAddress(params.chainId),
      extraParams: constants.HashZero,
      currency: opposingOrder.currency,
      trustedExecution: '0'
    };

    if (orderInput.complication !== opposingOrder.params.complication) {
      // TODO if the complication is updated we should make sure this gets updated accordingly
      throw new GenerateOrderError('Complication mismatch');
    }

    switch (opposingOrder.kind) {
      case 'single-token': {
        const nft = opposingOrder.nfts[0];
        orderInput.nfts = [nft];
        break;
      }
      case 'contract-wide': {
        if (!options.nfts) {
          throw new GenerateOrderError('NFTs must be specified to match contract wide orders');
        }
        orderInput.nfts = options.nfts;
        break;
      }
      default: {
        // TODO support more order types
        throw new GenerateOrderError(`Unsupported order kind: ${opposingOrder.kind} Order: ${opposingRawOrder.id}`);
      }
    }

    const order = new Flow.Order(chainId, orderInput);

    return { order, opposingOrder };
  }

  protected async _getNftApprovals(chainId: ChainId, signer: string, nfts: ChainNFTs[]) {
    const approvals: TokenApprovalRequest[] = [];
    const provider = this._ethereumService.getProvider(chainId);
    const { tokens } = await this._getFillableTokens(chainId, signer, nfts);

    for (const token of tokens) {
      const message = `Set approval for Infinity to manage your nfts in collection: ${token.collection} - you will only need to do this once for each collection`;
      if (!token.isApproved) {
        const erc721 = new Erc721(provider, token.collection);
        const exchange = this._contractService.getExchangeAddress(chainId);
        approvals.push({
          status: 'incomplete',
          message,
          kind: RequestKind.TokenApproval,
          txData: erc721.approveTransaction(signer, exchange)
        });
      } else {
        approvals.push({
          status: 'complete',
          message,
          kind: RequestKind.TokenApproval
        });
      }

      for (const item of token.tokens) {
        if (!item.isOwner) {
          throw new GenerateOrderError(
            `Token ${token.collection} - Token ID ${item.tokenId} is not owned by ${signer}`
          ); // TODO handle this
        }
      }
    }

    return approvals;
  }

  /**
   * TODO optimize this
   */
  protected async _getFillableTokens(chainId: ChainId, maker: string, chainNfts: ChainNFTs[]) {
    const provider = this._ethereumService.getProvider(chainId);

    type NftsWithOwnershipData = {
      collection: string;
      isApproved: boolean;
      tokens: { tokenId: string; numTokens: number; isOwner: boolean }[];
    };

    const nfts: NftsWithOwnershipData[] = [];
    const ownedAndApprovedNfts: NftsWithOwnershipData[] = [];

    for (const { collection, tokens } of chainNfts) {
      const erc721 = new Erc721(provider, collection);
      const isApproved = await erc721.isApproved(maker, this._contractService.getExchangeAddress(chainId));
      const collectionNfts: NftsWithOwnershipData = {
        collection,
        isApproved,
        tokens: []
      };

      for (const { tokenId, numTokens } of tokens) {
        const owner = await erc721.getOwner(tokenId);
        const isOwner = trimLowerCase(owner) === trimLowerCase(maker);
        collectionNfts.tokens.push({
          isOwner,
          tokenId,
          numTokens
        });
      }

      nfts.push(collectionNfts);

      if (isApproved) {
        const ownedTokens = collectionNfts.tokens.filter((item) => item.isOwner);
        if (ownedTokens.length > 0) {
          ownedAndApprovedNfts.push({
            collection,
            isApproved,
            tokens: ownedTokens
          });
        }
      }
    }

    const balance = ownedAndApprovedNfts.reduce((acc, { tokens }) => {
      return acc + tokens.reduce((acc, { numTokens }) => acc + numTokens, 0);
    }, 0);

    return {
      balance,
      tokens: nfts,
      fillableTokens: ownedAndApprovedNfts
    };
  }
}
