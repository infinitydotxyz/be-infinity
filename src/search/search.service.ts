import {
  BaseCollection,
  ChainId,
  CollectionDisplayData,
  NftDisplayData,
  SearchBy,
  SearchType,
  SubQuery,
  TokenStandard
} from '@infinityxyz/lib/types/core';
import { NftDto, SearchResponseDto, SubQueryDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getEndCode, getSearchFriendlyString, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { DeepPartial } from 'types/utils';

type FirestoreCursor = (string | number)[] | string[] | number[] | string | number;
interface SearchCursor {
  [SearchType.Collection]: {
    verified: FirestoreCursor;
    unverified: FirestoreCursor;
    subType: {
      ['nft']: {
        ['tokenId']: FirestoreCursor;
      };
    };
  };
}

@Injectable()
export class SearchService {
  get collectionsRef() {
    return this.firebaseService.firestore.collection(
      firestoreConstants.COLLECTIONS_COLL
    ) as FirebaseFirestore.CollectionReference<BaseCollection>;
  }

  constructor(protected firebaseService: FirebaseService, protected cursorService: CursorService) {}

  async search(query: SubQuery<any, any, any>): Promise<SearchResponseDto> {
    const cursor = this.cursorService.decodeCursorToObject<SearchCursor>(query.cursor);

    let res: {
      data: CollectionDisplayData[] | NftDisplayData[];
      cursor: DeepPartial<SearchCursor>;
      hasNextPage: boolean;
    } = {
      data: [],
      cursor: {},
      hasNextPage: false
    };
    switch (query.type) {
      case SearchType.Collection:
        res = await this.searchCollections(query as SubQueryDto<SearchType.Collection, any, any>, cursor);
        break;
      default:
        throw new Error('Not yet implemented');
    }

    return {
      ...res,
      cursor: this.cursorService.encodeCursor(res.cursor)
    };
  }

  async searchCollections(
    query: SubQuery<SearchType.Collection, any, any>,
    cursor: SearchCursor
  ): Promise<{
    data: CollectionDisplayData[] | NftDisplayData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    let res: {
      data: CollectionDisplayData[] | NftDisplayData[];
      cursor: DeepPartial<SearchCursor>;
      hasNextPage: boolean;
    };
    switch (query.searchBy as SearchBy<SearchType.Collection>) {
      case 'slug':
        res = await this.searchCollectionsBySlug(query as SubQueryDto<SearchType.Collection, 'slug', any>, cursor);
        break;
      case 'address':
        res = await this.searchCollectionsByAddress(
          query as SubQueryDto<SearchType.Collection, 'address', any>,
          cursor
        );
        break;
      default:
        throw new Error('Not yet implemented');
    }

    if ('subType' in query && query.subType) {
      const collection = (res.data?.[0] ?? {}) as CollectionDisplayData;
      switch (query.subType) {
        case 'nft':
          res = await this.searchCollectionNfts(query, collection, cursor);
          break;
        default:
          throw new Error('Not yet implemented');
      }
    }

    return res;
  }

  async searchCollectionNfts(
    query: SubQuery<SearchType.Collection, 'slug', 'nft'>,
    collection: CollectionDisplayData,
    cursor: SearchCursor
  ): Promise<{
    data: NftDisplayData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    switch (query.subTypeSearchBy) {
      case 'tokenId': {
        return await this.searchCollectionNftsByTokenId(query, collection, cursor);
      }
      default:
        throw new Error('Not yet implemented');
    }
  }

  async searchCollectionNftsByTokenId(
    query: SubQuery<SearchType.Collection, 'slug', 'nft'>,
    collection: CollectionDisplayData,
    cursor: SearchCursor
  ) {
    const collectionRef = this.collectionsRef.doc(`${collection.chainId}:${collection.address}`);
    const nftsRef = collectionRef.collection(
      firestoreConstants.COLLECTION_NFTS_COLL
    ) as FirebaseFirestore.CollectionReference<NftDto>;

    const nftsQuery = nftsRef.where('tokenId', '>=', query.subTypeQuery).orderBy('tokenId');

    const results = await this.getAndMerge(
      [
        {
          query: nftsQuery,
          cursor: cursor[SearchType.Collection]?.subType?.['nft']?.['tokenId'] ?? ''
        }
      ],
      query.limit,
      (nft) => nft?.tokenId ?? ''
    );

    return {
      data: results.data.map((item) => this.transformNft(item, collection)),
      hasNextPage: results.hasNextPage,
      cursor: {
        [SearchType.Collection]: {
          subType: {
            ['nft']: {
              ['tokenId']: results.cursors[0] ?? ''
            }
          }
        }
      }
    };
  }

  async searchCollectionsBySlug(
    query: SubQuery<SearchType.Collection, 'slug', any>,
    cursor: SearchCursor
  ): Promise<{
    data: CollectionDisplayData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
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
      data: results.data.map(this.transformCollection.bind(this)),
      hasNextPage: results.hasNextPage,
      cursor: {
        [SearchType.Collection]: {
          verified: results.cursors[0] ?? '',
          unverified: results.cursors[1] ?? ''
        }
      }
    };
  }

  async searchCollectionsByAddress(
    query: SubQuery<SearchType.Collection, 'address', any>,
    cursor: SearchCursor
  ): Promise<{
    data: CollectionDisplayData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    const q = this.collectionsRef
      .where('chainId', '==', query.chainId)
      .where('address', '>=', trimLowerCase(query.query));

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
      data: results.data.map(this.transformCollection.bind(this)),
      hasNextPage: results.hasNextPage,
      cursor: {
        [SearchType.Collection]: {
          verified: results?.cursors?.[0] || '',
          unverified: results?.cursors?.[1] || ''
        }
      }
    };
  }

  protected async getAndMerge<T>(
    queries: { query: FirebaseFirestore.Query<T>; cursor: FirestoreCursor }[],
    limit: number,
    getCursor: (item: Partial<T>) => FirestoreCursor
  ): Promise<{ data: Partial<T>[]; hasNextPage: boolean; cursors: FirestoreCursor[] }> {
    const queryResults = await Promise.all(
      queries.map(async (item, queryIndex) => {
        let itemQuery: FirebaseFirestore.Query<T> = item.query;
        if (
          (Array.isArray(item.cursor) && item.cursor.length > 0) ||
          (!Array.isArray(item.cursor) && item.cursor != null && item.cursor !== '')
        ) {
          itemQuery = itemQuery.startAfter(item.cursor);
        }
        const snapshot = await itemQuery.limit(limit + 1).get();

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

  protected transformCollection(collection: Partial<BaseCollection>): CollectionDisplayData {
    return {
      chainId: (collection.chainId ?? '') as ChainId,
      address: collection.address ?? '',
      hasBlueCheck: collection.hasBlueCheck ?? false,
      slug: collection.slug ?? '',
      name: collection?.metadata?.name ?? '',
      profileImage: collection?.metadata?.profileImage ?? '',
      bannerImage: collection?.metadata?.bannerImage ?? ''
    };
  }

  protected transformNft(nft: Partial<NftDto>, collection: CollectionDisplayData): NftDisplayData {
    return {
      collectionDisplayData: collection,
      tokenId: nft.tokenId ?? '',
      name: nft.metadata?.name ?? nft.tokenId ?? '',
      numTraitTypes: nft.numTraitTypes ?? 0,
      image: (nft.alchemyCachedImage || nft.image?.url || nft.image?.originalUrl) ?? '',
      tokenStandard: nft.tokenStandard ?? ('' as TokenStandard)
    };
  }
}