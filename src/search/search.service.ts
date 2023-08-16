import { BaseCollection, ChainId, SearchType, SubQuery } from '@infinityxyz/lib/types/core';
import { SubQueryDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { ReservoirCollectionSearchResult, ReservoirTokenV6 } from 'reservoir/types';
import { DeepPartial } from 'types/utils';
import { CollectionSearchResultData, NftSearchResultData, SearchResponse } from './types';

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
      data: CollectionSearchResultData[] | NftSearchResultData[];
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
    data: CollectionSearchResultData[] | NftSearchResultData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    let res: {
      data: CollectionSearchResultData[] | NftSearchResultData[];
      cursor: DeepPartial<SearchCursor>;
      hasNextPage: boolean;
    };

    if ('subType' in query && query.subType) {
      switch (query.subType) {
        case 'nft':
          res = await this.searchCollectionNfts(query, cursor);
          break;
        default:
          throw new Error('Not yet implemented');
      }
    } else {
      const searchTerm = query.query;
      if (searchTerm.startsWith('0x')) {
        res = await this.searchCollectionsByAddress(
          query as SubQueryDto<SearchType.Collection, 'address', any>,
          cursor
        );
      } else {
        res = await this.searchCollectionsBySlug(query as SubQueryDto<SearchType.Collection, 'slug', any>, cursor);
      }
    }

    return res;
  }

  async searchCollectionNfts(
    query: SubQuery<SearchType.Collection, 'address', 'nft'>,
    cursor: SearchCursor
  ): Promise<{
    data: NftSearchResultData[];
    cursor: DeepPartial<SearchCursor>;
    hasNextPage: boolean;
  }> {
    switch (query.subTypeSearchBy) {
      case 'tokenId': {
        return await this.searchCollectionNftsByTokenId(query, cursor);
      }
      default:
        throw new Error('Not yet implemented');
    }
  }

  async searchCollectionNftsByTokenId(
    query: SubQuery<SearchType.Collection, 'address', 'nft'>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cursor: SearchCursor
  ) {
    const result = await this.reservoirService.getSingleTokenInfo(query.chainId, query.query, query.subTypeQuery);
    const first = result?.tokens[0];

    if (!first) {
      return {
        data: [],
        hasNextPage: false,
        cursor: {
          [SearchType.Collection]: {
            subType: {
              ['nft']: {
                ['tokenId']: ''
              }
            }
          }
        }
      };
    }

    return {
      data: [this.transformNft(query.chainId, first)],
      hasNextPage: false,
      cursor: {
        [SearchType.Collection]: {
          subType: {
            ['nft']: {
              ['tokenId']: ''
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

  protected transformNft(chainId: string, token: ReservoirTokenV6): NftSearchResultData {
    const nft = token?.token;
    return {
      chainId,
      collectionAddress: nft?.contract ?? nft?.collection?.id ?? '',
      tokenId: nft?.tokenId ?? '',
      name: nft?.name ?? nft.tokenId ?? '',
      numTraitTypes: nft?.attributes?.length ?? 0,
      image: nft.image ?? '',
      tokenStandard: nft.kind ?? ''
    };
  }
}
