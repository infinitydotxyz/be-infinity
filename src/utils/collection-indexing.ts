// eslint-disable-next-line @typescript-eslint/no-unused-vars
import axios, { AxiosError } from 'axios';

export const COLLECTION_INDEXING_SERVICE_URL =
  'https://nft-collection-service-dot-nftc-infinity.ue.r.appspot.com/collection';

export enum ResponseType {
  IndexingInitiated = 'INDEXING_INITIATED',
  AlreadyQueued = 'INDEXING_ALREADY_INITIATED',
  BadRequest = 'BAD_REQUEST',
  ServerError = 'SERVER_ERROR',
  UnknownError = 'UNKNOWN_ERROR'
}

function getResponseType(status: number): ResponseType {
  switch (status) {
    case 202:
      return ResponseType.IndexingInitiated;
    case 200:
      return ResponseType.AlreadyQueued;
    case 400:
      return ResponseType.BadRequest;
    case 500:
      return ResponseType.ServerError;
    default:
      return ResponseType.UnknownError;
  }
}

/**
 * enqueues a collection for indexing
 */
export async function attemptToIndexCollection(collection: { collectionAddress: string; chainId: string }) {
  try {
    const res = await enqueueCollection(collection, COLLECTION_INDEXING_SERVICE_URL);
    if (res !== ResponseType.AlreadyQueued && res !== ResponseType.IndexingInitiated) {
      console.error(
        `Failed to enqueue collection:${collection.chainId}:${collection.collectionAddress}. Reason: ${res}`
      );
    }
  } catch (err) {
    console.error(`Failed to enqueue collection. ${collection.chainId}:${collection.collectionAddress}`);
    console.error(err);
  }
}

export async function enqueueCollection(
  collection: { chainId: string; collectionAddress: string; indexInitiator?: string },
  url: string
): Promise<ResponseType> {
  try {
    const res = await axios.post(
      url,
      {
        chainId: collection.chainId,
        address: collection.collectionAddress,
        indexInitiator: collection.indexInitiator
      },
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    const response = getResponseType(res.status);

    return response;
  } catch (err: AxiosError | any) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status && typeof err.response.status === 'number') {
        const response = getResponseType(err.response.status);
        return response;
      } else {
        throw err;
      }
    }
    throw err;
  }
}
