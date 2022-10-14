import { BaseCollection, ChainId } from '@infinityxyz/lib/types/core';
import { CollectionHistoricalStatsQueryDto, NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getEndCode, getSearchFriendlyString, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';

export enum SearchType {
  Collection = 'collection',
  User = 'user'
}

export interface SearchQuery {
  type?: SearchType;
  cursor: string;
  limit: number;
  chainId: ChainId;
  query: string;
}

export enum CollectionSearchType {
  Nft = 'nft'
}

export interface BaseUserSearchQuery extends SearchQuery {
  type: SearchType.User;
}

enum CollectionSearchBy {
  Slug = 'slug',
  Address = 'address'
}

export interface BaseCollectionSearchQuery extends SearchQuery {
  type: SearchType.Collection;
  subType?: CollectionSearchType;
  searchBy: CollectionSearchBy;
}

export interface CollectionSearchQueryByAddress extends BaseCollectionSearchQuery {
  searchBy: CollectionSearchBy.Address;
}

export interface CollectionSearchQueryBySlug extends BaseCollectionSearchQuery {
  searchBy: CollectionSearchBy.Slug;
}

export type BaseCollectionSearches = CollectionSearchQueryByAddress | CollectionSearchQueryBySlug;

export enum CollectionNftsSearchBy {
  TokenId = 'tokenId'
}

export type BaseNftSearchQuery = BaseCollectionSearches & {
  subType: CollectionSearchType.Nft;
  subTypeQuery: string;
  subTypeSearchBy: CollectionNftsSearchBy;
};

export type NftSearchQueryByTokenId = BaseNftSearchQuery & {
  subTypeSearchBy: CollectionNftsSearchBy.TokenId;
  tokenId: string;
};

export type CollectionNftSearches = NftSearchQueryByTokenId;

export type CollectionSearches = BaseCollectionSearches | CollectionNftSearches;

export type UserSearches = BaseUserSearchQuery;

export type Searches = CollectionSearches | UserSearches;

interface SearchCursor {
  [SearchType.Collection]: {
    verified: string;
    unverified: string;
  };
  [SearchType.User]: {
    verified: string;
  };
}

type FirestoreCursor = (string | number)[] | string[] | number[] | string | number;

@Injectable()
export class SearchService {
  get collectionsRef() {
    return this.firebaseService.firestore.collection(
      firestoreConstants.COLLECTIONS_COLL
    ) as FirebaseFirestore.CollectionReference<BaseCollection>;
  }

  constructor(protected firebaseService: FirebaseService, protected cursorService: CursorService) {}

  search(query: Searches) {
    const cursor = this.cursorService.decodeCursorToObject<SearchCursor>(query.cursor);

    switch (query.type) {
      case SearchType.Collection:
        return this.searchCollections(query, cursor);
      case SearchType.User:
      default:
        throw new Error('Not yet implemented');
    }
  }

  async searchCollections(query: CollectionSearches, cursor: SearchCursor) {
    let collections;
    switch (query.searchBy) {
      case CollectionSearchBy.Slug:
        collections = await this.searchCollectionsBySlug(query, cursor);
        break;
      case CollectionSearchBy.Address:
        collections = await this.searchCollectionsByAddress(query, cursor);
        break;
      default:
        throw new Error('Not yet implemented');
    }

    if ('subType' in query && query.subType === CollectionSearchType.Nft) {
      const collection = collections.data[0];
      const res = await this.searchCollectionNfts(query as CollectionNftSearches, collection, cursor);
      return res;
    } else {
      return collections;
    }
  }

  async searchCollectionNfts(query: CollectionNftSearches, collection: Partial<BaseCollection>, cursor: SearchCursor) {
    const collectionRef = this.collectionsRef.doc(`${collection.chainId}:${collection.address}`);
    const nftsRef = collectionRef.collection(
      firestoreConstants.COLLECTION_NFTS_COLL
    ) as FirebaseFirestore.CollectionReference<NftDto>;

    let nfts: Partial<NftDto>[];
    switch (query.subTypeSearchBy) {
      case CollectionNftsSearchBy.TokenId: {
        const snapshot = await nftsRef.doc(query.tokenId).get();
        nfts = [snapshot.data() ?? {}];
        break;
      }
      default:
        throw new Error('Not yet implemented');
    }

    return nfts;
  }

  async searchCollectionsBySlug(query: CollectionSearchQueryBySlug, cursor: SearchCursor) {
    console.log(`Searching by slug`);
    const startsWith = getSearchFriendlyString(query.query);
    const endCode = getEndCode(startsWith);

    const q = this.collectionsRef
      .where('chainId', '==', query.chainId)
      .where('slug', '>=', startsWith)
      .where('slug', '<', endCode);

    const verifiedQuery = q.where('hasBlueCheck', '==', true).orderBy('slug');
    const unverifiedQuery = q.where('hasBlueCheck', '==', false).orderBy('slug');
    const queries = [
      {
        key: 'verified',
        query: verifiedQuery,
        cursor: cursor?.[SearchType.Collection]?.verified ?? ''
      },
      {
        key: 'unverified',
        query: unverifiedQuery,
        cursor: cursor?.[SearchType.Collection]?.unverified ?? ''
      }
    ];

    const getCursor = (item: Partial<BaseCollection>): FirestoreCursor => item.address ?? '';
    const results = await this.getAndMerge(queries, query.limit, getCursor);

    return {
      data: results.data,
      hasNextPage: results.hasNextPage,
      cursor: {
        [SearchType.Collection]: {
          verified: results.cursors[0] ?? '',
          unverified: results.cursors[1] ?? ''
        }
      }
    };
  }

  async searchCollectionsByAddress(query: CollectionSearchQueryByAddress, cursor: SearchCursor) {
    const q = this.collectionsRef
      .where('chainId', '==', query.chainId)
      .where('address', '>=', trimLowerCase(query.query)); // TODO trim lower case in dto

    const verifiedQuery = q.where('hasBlueCheck', '==', true).orderBy('address');
    const unverifiedQuery = q.where('hasBlueCheck', '==', false).orderBy('address');
    const queries = [
      {
        key: 'verified',
        query: verifiedQuery,
        cursor: cursor?.[SearchType.Collection]?.verified ?? ''
      },
      {
        key: 'unverified',
        query: unverifiedQuery,
        cursor: cursor?.[SearchType.Collection]?.unverified ?? ''
      }
    ];

    const getCursor = (item: Partial<BaseCollection>): FirestoreCursor => item.address ?? '';
    const results = await this.getAndMerge(queries, query.limit, getCursor);

    return {
      data: results.data,
      hasNextPage: results.hasNextPage,
      cursor: {
        [SearchType.Collection]: {
          verified: results.cursors[0] ?? '',
          unverified: results.cursors[1] ?? ''
        }
      }
    };
  }

  async getAndMerge<T>(
    queries: { query: FirebaseFirestore.Query<T>; cursor: FirestoreCursor }[],
    limit: number,
    getCursor: (item: Partial<T>) => FirestoreCursor
  ): Promise<{ data: Partial<T>[]; hasNextPage: boolean; cursors: FirestoreCursor[] }> {
    const queryResults = await Promise.all(
      queries.map(async (item, queryIndex) => {
        let itemQuery = item.query;
        if (
          (Array.isArray(item.cursor) && item.cursor.length > 0) ||
          (!Array.isArray(item.cursor) && item.cursor != null && item.cursor !== '')
        ) {
          console.log(`Applying cursor: ${item.cursor} ${!!item.cursor} ${typeof item.cursor}`);
          itemQuery = itemQuery.startAfter(item.cursor);
        }
        const snapshot = await itemQuery.limit(limit + 1).get();
        console.log(`Got ${snapshot.docs.length} results for query ${queryIndex} and limit: ${limit + 1}`);

        const snapshotDocs = snapshot.docs.map((item) => {
          const data = item.data() ?? ({} as Partial<T>);
          const itemCursor = getCursor(data);
          return {
            data,
            cursor: itemCursor,
            ref: item.ref,
            queryIndex
          };
        });
        console.log(`Found: ${snapshotDocs.length} for query ${queryIndex}`);

        return snapshotDocs;
      })
    );

    const flattenedResults = queryResults.flat();

    const resultsInLimit = flattenedResults.slice(0, limit);
    const hasNextPage = flattenedResults.length > limit;
    const cursors = flattenedResults
      .reduce((acc: FirestoreCursor[], item, index) => {
        const existingCursor = acc[item.queryIndex];
        const isWithinLimit = index < limit;
        if (isWithinLimit || !existingCursor) {
          acc[item.queryIndex] = item.cursor;
        }

        return acc;
      }, [] as FirestoreCursor[])
      .map((cursor, queryIndex) => {
        if (!cursor) {
          const initialCursor = queries[queryIndex]?.cursor;
          return initialCursor;
        }
        return cursor;
      });

    return {
      data: resultsInLimit.map((item) => item.data),
      hasNextPage,
      cursors: cursors
    };
  }
}
