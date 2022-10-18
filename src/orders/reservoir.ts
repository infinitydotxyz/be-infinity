import api from 'api';
const sdk = api('@reservoirprotocol/v1.0#4vl21xl9d4zcp0');

import { paths } from '@reservoir0x/reservoir-kit-client';
import { SignedOBOrderDto } from '@infinityxyz/lib/types/dto/orders/signed-ob-order.dto';
import { ChainId } from '@infinityxyz/lib/types/core';

// TODO - put in env
const RESERVOIR_API_KEY = 'f0d48941-4084-4480-a50a-deb448752f5f';

sdk.auth(RESERVOIR_API_KEY);

// ==============================================================

export const getSales = () => {
  sdk
    .getSalesV4({ limit: '100', accept: '*/*' })
    .then((res: unknown) => {
      const response = res as paths['/sales/v4']['get']['responses']['200']['schema'];

      if (response) {
        for (const x of response.sales ?? []) {
          console.log('=====================================================');
          console.log(JSON.stringify(x, null, 2));
        }
      }

      return '';
    })
    .catch((err: unknown) => console.error(err));
};

// ==============================================================

export const getAsks = async (): Promise<SignedOBOrderDto[]> => {
  const result: SignedOBOrderDto[] = [];

  try {
    const res = await sdk.getOrdersAsksV3({
      includePrivate: 'true',
      includeMetadata: 'true',
      includeRawData: 'false',
      sortBy: 'createdAt',
      limit: '50',
      accept: '*/*'
    });

    const response = res as paths['/orders/asks/v3']['get']['responses']['200']['schema'];

    if (response) {
      for (const x of response.orders ?? []) {
        if (x.status === 'active') {
          //   console.log('=====================================================');
          //   console.log(JSON.stringify(x, null, 2));

          let collectionAddress = '';
          let tokenId = '';

          if (x.tokenSetId) {
            // "token:0x1a8046b6f194f9f5a84bf001e133a4df0a298ad8:198",
            const tokenInfo = x.tokenSetId.split(':');

            if (tokenInfo.length === 3) {
              collectionAddress = tokenInfo[1];
              tokenId = tokenInfo[2];
            }
          }

          const order: SignedOBOrderDto = {
            id: x.id ?? '',
            chainId: '1',
            isSellOrder: x.side === 'sell',
            numItems: 1,
            startPriceEth: x.price?.amount?.native ?? 0,
            endPriceEth: x.price?.amount?.native ?? 0,
            startTimeMs: x.validFrom * 1000,
            endTimeMs: x.validUntil * 1000,
            maxGasPriceWei: '0',
            nonce: 1234567,
            makerAddress: x.maker,
            makerUsername: '',
            nfts: [
              {
                chainId: ChainId.Mainnet,
                collectionAddress: collectionAddress,
                collectionImage: '',
                collectionName: x.metadata?.data?.collectionName ?? '',
                collectionSlug: '',
                hasBlueCheck: false,
                tokens: [
                  {
                    attributes: [],
                    numTokens: 1,
                    takerAddress: '',
                    takerUsername: '',
                    tokenId: tokenId,
                    tokenImage: x.metadata?.data?.image ?? '',
                    tokenName: x.metadata?.data?.tokenName ?? ''
                  }
                ]
              }
            ],
            signedOrder: {
              isSellOrder: x.side === 'sell',
              signer: '',
              nfts: [
                {
                  collection: collectionAddress,
                  tokens: [
                    {
                      numTokens: 1,
                      tokenId: tokenId
                    }
                  ]
                }
              ],
              constraints: [],
              execParams: [],
              extraParams: '',
              sig: ''
            },
            execParams: {
              complicationAddress: '',
              currencyAddress: ''
            },
            extraParams: { buyer: '' }
          };

          result.push(order);
        }
      }
    }

    // console.log(result);

    return result;
  } catch (err) {
    console.log(err);
  }

  return [];
};

// ==============================================================

export const getBids = () => {
  sdk
    .getOrdersBidsV4({
      includePrivate: 'true',
      includeMetadata: 'true',
      includeRawData: 'false',
      sortBy: 'createdAt',
      limit: '50',
      accept: '*/*'
    })
    .then((res: unknown) => {
      const response = res as paths['/orders/bids/v4']['get']['responses']['200']['schema'];

      if (response) {
        for (const x of response.orders ?? []) {
          console.log('=====================================================');
          console.log(JSON.stringify(x, null, 2));
        }
      }

      return;
    })
    .catch((err: unknown) => console.error(err));
};
