import {
  BaseCollection,
  ChainId,
  CollectionDisplayData,
  NftDisplayData,
  SearchType,
  SubQuery,
  TokenStandard
} from '@infinityxyz/lib/types/core';
import { NftDto, SubQueryDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { ReservoirCollectionSearchResult } from 'reservoir/types';
import { DeepPartial } from 'types/utils';
import { CollectionSearchResultData, SearchResponse } from './types';

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

  constructor(
    protected firebaseService: FirebaseService,
    protected cursorService: CursorService,
    protected reservoirService: ReservoirService
  ) {}

  async search(query: SubQuery<any, any, any>): Promise<SearchResponse> {
    const cursor = this.cursorService.decodeCursorToObject<SearchCursor>(query.cursor);

    let res: {
      data: CollectionSearchResultData[] | NftDisplayData[];
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
    data: CollectionSearchResultData[] | NftDisplayData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    let res: {
      data: CollectionSearchResultData[] | NftDisplayData[];
      cursor: DeepPartial<SearchCursor>;
      hasNextPage: boolean;
    };
    const searchTerm = query.query;
    if (searchTerm.startsWith('0x')) {
      res = await this.searchCollectionsByAddress(query as SubQueryDto<SearchType.Collection, 'address', any>, cursor);
    } else {
      res = await this.searchCollectionsBySlug(query as SubQueryDto<SearchType.Collection, 'slug', any>, cursor);
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

  private async searchCollectionsInternal(chainId: string, name?: string, collectionAddress?: string) {
    let results;
    if (name) {
      results = await this.reservoirService.searchCollections(chainId, name);
    } else if (collectionAddress) {
      results = await this.reservoirService.searchCollections(chainId, undefined, collectionAddress);
    }
    if (!results) {
      return {
        data: [],
        hasNextPage: false,
        cursor: {
          [SearchType.Collection]: {
            verified: '',
            unverified: ''
          }
        }
      };
    }

    return {
      data: results.collections.map((item) => this.transformCollection(chainId, item)),
      hasNextPage: false,
      cursor: {
        [SearchType.Collection]: {
          verified: '',
          unverified: ''
        }
      }
    };
  }

  async searchCollectionsBySlug(
    query: SubQuery<SearchType.Collection, 'slug', any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cursor: SearchCursor
  ): Promise<{
    data: CollectionSearchResultData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    return await this.searchCollectionsInternal(query.chainId, query.query, undefined);
  }

  async searchCollectionsByAddress(
    query: SubQuery<SearchType.Collection, 'address', any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cursor: SearchCursor
  ): Promise<{
    data: CollectionSearchResultData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    return await this.searchCollectionsInternal(query.chainId, undefined, query.query);
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

  protected transformCollection(
    chainId: string,
    collection: ReservoirCollectionSearchResult
  ): CollectionSearchResultData {
    return {
      chainId: chainId as ChainId,
      address: collection.contract ?? '',
      hasBlueCheck: collection.openseaVerificationStatus === 'verified',
      slug: collection.slug ?? '',
      name: collection.name ?? '',
      profileImage: collection.image ?? '',
      bannerImage: '',
      allTimeVolume: collection.allTimeVolume ?? 0,
      floorPrice: collection.floorAskPrice?.amount?.native ?? 0
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
