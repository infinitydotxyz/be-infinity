import api from 'api';
const sdk = api('@reservoirprotocol/v1.0#4vl21xl9d4zcp0');

import { paths } from '@reservoir0x/reservoir-kit-client';
import { SignedOBOrderDto } from '@infinityxyz/lib/types/dto/orders/signed-ob-order.dto';
import { reservoirTokenToNFT, reservoirAskToOrder, reservoirBidToOrder } from './reservoir-types';
import { NftDto } from '@infinityxyz/lib/types/dto';

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

export const getAsks = async (limit: number, cursor: string): Promise<ReservoirResponse> => {
  const result: SignedOBOrderDto[] = [];
  let outCursor = '';

  try {
    const res = await sdk.getOrdersAsksV3({
      // token: 'tokenId',
      includePrivate: 'false',
      includeMetadata: 'true',
      includeRawData: 'false',
      // Sorting by price allowed only when filtering by token
      // sortBy: sortByPrice ? 'price' : 'createdAt',
      sortBy: 'createdAt',
      continuation: cursor ? cursor : undefined,
      status: 'active',
      limit: limit.toString()
    });

    const response = res as paths['/orders/asks/v3']['get']['responses']['200']['schema'];

    if (response) {
      for (const x of response.orders ?? []) {
        result.push(reservoirAskToOrder(x));
      }

      outCursor = response.continuation ?? '';
    }

    // console.log(result);
  } catch (err) {
    console.log(err);
  }

  return { orders: result, cursor: outCursor };
};

// ==============================================================

export const getBids = async (limit: number, cursor: string): Promise<ReservoirResponse> => {
  const result: SignedOBOrderDto[] = [];
  let outCursor = '';

  try {
    const res = await sdk.getOrdersBidsV4({
      // token: 'tokenId',
      includePrivate: 'false',
      includeMetadata: 'true',
      includeRawData: 'false',
      status: 'active',
      // Sorting by price allowed only when filtering by token
      // sortBy: sortByPrice ? 'price' : 'createdAt',
      sortBy: 'createdAt',
      continuation: cursor ? cursor : undefined,
      limit: limit.toString()
    });

    if (res) {
      const response = res as paths['/orders/bids/v4']['get']['responses']['200']['schema'];

      if (response) {
        for (const x of response.orders ?? []) {
          //  console.log(JSON.stringify(x, null, 2));
          result.push(reservoirBidToOrder(x));
        }

        outCursor = response.continuation ?? '';
      }
    }
  } catch (err) {
    console.error(err);
  }

  return { orders: result, cursor: outCursor };
};

// ==============================================================

export const getActivity = async (limit: number): Promise<ReservoirResponse> => {
  const result: SignedOBOrderDto[] = [];
  let cursor = '';

  try {
    const res = await sdk.getActivityV2({
      limit: limit.toString()
    });

    if (res) {
      const response = res as paths['/activity/v2']['get']['responses']['200']['schema'];

      if (response) {
        for (const x of response.activities ?? []) {
          console.log(JSON.stringify(x, null, 2));

          // {
          //   "id": 1,
          //   "type": "ask",
          //   "contract": "0xd75b811814fff5f110dcc37f25285d90d3e7f63b",
          //   "collectionId": "0xd75b811814fff5f110dcc37f25285d90d3e7f63b",
          //   "tokenId": "3840",
          //   "fromAddress": "0x39adae38cea67916bb5ae2eeb91df0e5b3a6ffa4",
          //   "toAddress": null,
          //   "price": 0.03,
          //   "amount": 1,
          //   "timestamp": 1654105352,
          //   "order": {
          //     "id": "0xb804d16ba4b5e76e25ae8e66bf24adb2a8aa256a6f462175745a48adbf98927b",
          //     "side": "ask",
          //     "source": {
          //       "domain": "opensea.io",
          //       "name": "OpenSea",
          //       "icon": "https://raw.githubusercontent.com/reservoirprotocol/indexer/v5/src/models/sources/opensea-logo.svg"
          //     }
          //   }
          // }
        }

        cursor = response.continuation?.toString() ?? '';
      }
    }
  } catch (err) {
    console.error(err);
  }

  return { orders: result, cursor: cursor };
};

// ==============================================================

export const getTokens = async (limit: number, cursor: string): Promise<ReservoirTokenResponse> => {
  const result: NftDto[] = [];
  let outCursor = '';

  try {
    const res = await sdk.getTokensV5({
      collection: '0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63',
      includeAttributes: 'false',
      includeTopBid: 'false',
      sortBy: 'floorAskPrice', // 'tokenId' 'rarity'
      sortDirection: 'asc',
      continuation: cursor ? cursor : undefined,
      limit: limit.toString()
    });

    if (res) {
      const response = res as paths['/tokens/v5']['get']['responses']['200']['schema'];

      if (response) {
        for (const x of response.tokens ?? []) {
          // console.log(JSON.stringify(x, null, 2));
          result.push(reservoirTokenToNFT(x));
        }

        outCursor = response.continuation ?? '';
      }
    }
  } catch (err) {
    console.error(err);
  }

  // console.log(JSON.stringify(result, null, 2));

  return { nfts: result, cursor: outCursor };
};
