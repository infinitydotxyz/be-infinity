import { ChainId, OrderDirection } from '@infinityxyz/lib/types/core';
import {
  ExternalNftDto,
  NftActivityFiltersDto,
  NftActivityQueryDto,
  NftArrayDto,
  NftDto,
  NftQueryDto,
  NftsOrderBy,
  NftsQueryDto,
  OrderType
} from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId, getSearchFriendlyString } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { BackfillService } from 'backfill/backfill.service';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { EthereumService } from 'ethereum/ethereum.service';
import { firestore } from 'firebase-admin';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { getNftActivity, getNftSocialActivity } from 'utils/activity';
import { getReservoirTokens } from 'utils/reservoir';

@Injectable()
export class NftsService {
  constructor(
    private firebaseService: FirebaseService,
    private paginationService: CursorService,
    private ethereumService: EthereumService,
    private backfillService: BackfillService
  ) {}

  async getNft(nftQuery: NftQueryDto): Promise<NftDto | undefined> {
    const [nft] = await this.getNfts([
      { address: nftQuery.address, chainId: nftQuery.chainId, tokenId: nftQuery.tokenId }
    ]);

    if (nft) {
      try {
        // to handle stale opensea ownership data
        const owner = await this.ethereumService.getErc721Owner({
          address: nftQuery.address,
          tokenId: nftQuery.tokenId,
          chainId: nftQuery.chainId
        });
        if (owner && nft.owner !== owner) {
          nft.owner = owner;
          this.updateOwnershipInFirestore(nft);
        }
      } catch (err) {
        console.error(`failed to get owner for NFT: ${nftQuery.chainId}:${nftQuery.address}:${nftQuery.tokenId}`);
      }
    }

    return nft;
  }

  private updateOwnershipInFirestore(nft: NftDto): void {
    const chainId = nft.chainId;
    const collectionAddress = nft.collectionAddress ?? '';
    const tokenId = nft.tokenId;
    const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
    this.firebaseService.firestore
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(collectionDocId)
      .collection(firestoreConstants.COLLECTION_NFTS_COLL)
      .doc(tokenId)
      .set({ owner: nft.owner }, { merge: true })
      .then(() => {
        console.log(`Updated ownership of ${chainId}:${collectionAddress}:${tokenId} to ${nft.owner}`);
      })
      .catch((err) => {
        console.error(`Failed to update ownership of ${chainId}:${collectionAddress}:${tokenId} to ${nft.owner}`);
        console.error(err);
      });
  }

  isSupported(nfts: NftDto[]) {
    // const { getCollection } = await this.collectionsService.getCollectionsByAddress(
    //   nfts.map((nft) => ({ address: nft.collectionAddress ?? '', chainId: nft.chainId }))
    // );

    const externalNfts: ExternalNftDto[] = nfts.map((nft) => {
      // const collection = getCollection({ address: nft.collectionAddress ?? '', chainId: nft.chainId });
      // const isSupported = collection?.state?.create?.step === CreationFlow.Complete;
      const isSupported = true;
      const externalNft: ExternalNftDto = {
        ...nft,
        isSupported
      };
      return externalNft;
    });

    return externalNfts;
  }

  public async refreshMetaData(nft: { address: string; chainId: ChainId; tokenId: string }): Promise<NftDto[]> {
    const result = await this.backfillService.backfillNfts([nft]);

    return result;
  }

  async getNfts(nfts: { address: string; chainId: ChainId; tokenId: string }[]): Promise<NftDto[]> {
    const refs = nfts.map((item) => {
      const collectionDocId = getCollectionDocId({
        collectionAddress: item.address,
        chainId: item.chainId
      });
      return this.firebaseService.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(item.tokenId);
    });

    if (refs.length === 0) {
      return [];
    }

    const snapshots = await this.firebaseService.firestore.getAll(...refs);

    const nftsMergedWithSnapshot = nfts.map((item, index) => {
      const snapshot = snapshots[index];
      const nft = (snapshot.data() ?? {}) as NftDto;
      return {
        ...item,
        ...nft
      };
    });

    const nftsToBackfill = [];

    for (const nft of nftsMergedWithSnapshot) {
      if (!nft || !(nft.image?.url || nft.image?.originalUrl)) {
        const address = nft.address || nft.collectionAddress;
        if (nft.tokenId && address && nft.chainId) {
          nftsToBackfill.push({
            chainId: nft.chainId,
            address,
            tokenId: nft.tokenId
          });
        }
      }
    }

    // async backfill
    this.backfillService.backfillNfts(nftsToBackfill).catch((err) => {
      console.error(err);
    });

    return nftsMergedWithSnapshot;
  }

  async getCollectionNfts(collection: ParsedCollectionId, query: NftsQueryDto): Promise<NftArrayDto> {
    type Cursor = Record<NftsOrderBy, string | number>;
    const nftsCollection = collection.ref.collection(firestoreConstants.COLLECTION_NFTS_COLL);
    const decodedCursor = this.paginationService.decodeCursorToObject<Cursor>(query.cursor);
    let nftsQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = nftsCollection;

    const orderType = query.orderType ?? OrderType.Listing;
    if (query.orderBy === NftsOrderBy.Price && !query.orderType) {
      query.orderType = OrderType.Listing;
    }

    const startPriceField = `ordersSnippet.${orderType}.orderItem.startPriceEth`;

    const hasPriceFilter = query.minPrice !== undefined || query.maxPrice !== undefined;
    if (query.orderType || hasPriceFilter) {
      nftsQuery = nftsQuery.where(`ordersSnippet.${orderType}.hasOrder`, '==', true);
    }

    if (query.traitTypes) {
      const traitTypes = query.traitTypes ?? [];
      const traitTypesValues = query?.traitValues?.map((item) => item.split('|')) ?? [];
      const traits: object[] = [];
      for (let index = 0; index < traitTypes.length; index++) {
        const traitType = traitTypes[index];
        const traitValues = traitTypesValues[index];
        for (const traitValue of traitValues) {
          if (traitValue) {
            const isTraitValueNumeric = !isNaN(Number(traitValue));
            const traitTypeObj = traitType ? { trait_type: traitType } : {};
            traits.push({
              value: isTraitValueNumeric ? Number(traitValue) : traitValue,
              ...traitTypeObj
            });
          }
        }
      }

      if (traits.length > 0) {
        // orderBy won't work here unless we use a composite index on every possible combination of trait_type and value which is infeasible
        const attrKeys: any = [];
        traits.forEach((attr: any) => {
          const attrType = getSearchFriendlyString(attr['trait_type']);
          const attrValue = getSearchFriendlyString(String(attr['value']));
          const attrKey = attrType + ':::' + attrValue; // ':::' is the random separator we used to store data in firestore
          attrKeys.push(attrKey);
        });
        for (const attrKey of attrKeys) {
          nftsQuery = nftsQuery.where(`metadata.attributesMap.${attrKey}`, '==', true);
        }
      }
      nftsQuery = nftsQuery.orderBy(firestore.FieldPath.documentId());
      const startAfterDocId = decodedCursor?.[NftsOrderBy.DocId];
      if (startAfterDocId) {
        nftsQuery = nftsQuery.startAfter(startAfterDocId);
      }
    } else if (hasPriceFilter) {
      const minPrice = query.minPrice ?? 0;
      const maxPrice = query.maxPrice ?? Number.MAX_SAFE_INTEGER;
      nftsQuery = nftsQuery.where(startPriceField, '>=', minPrice);
      nftsQuery = nftsQuery.where(startPriceField, '<=', maxPrice);
      nftsQuery = nftsQuery.orderBy(startPriceField, query.orderDirection);
      nftsQuery = nftsQuery.orderBy(NftsOrderBy.TokenIdNumeric, OrderDirection.Ascending); // to break ties
      const startAfterPrice = decodedCursor?.[NftsOrderBy.Price];
      const startAfterTokenId = decodedCursor?.[NftsOrderBy.TokenIdNumeric];
      if (startAfterPrice && startAfterTokenId) {
        nftsQuery = nftsQuery.startAfter(startAfterPrice, startAfterTokenId);
      }
    } else {
      if (query.orderBy === NftsOrderBy.Price) {
        nftsQuery = nftsQuery
          .orderBy(startPriceField, query.orderDirection)
          .orderBy(NftsOrderBy.TokenIdNumeric, OrderDirection.Ascending);
        const startAfterPrice = decodedCursor?.[NftsOrderBy.Price];
        const startAfterTokenId = decodedCursor?.[NftsOrderBy.TokenIdNumeric];
        if (startAfterPrice && startAfterTokenId) {
          nftsQuery = nftsQuery.startAfter(startAfterPrice, startAfterTokenId);
        }
      } else {
        nftsQuery = nftsQuery.orderBy(query.orderBy, query.orderDirection);
        if (decodedCursor?.[query.orderBy]) {
          nftsQuery = nftsQuery.startAfter(decodedCursor[query.orderBy]);
        }
      }
    }

    nftsQuery = nftsQuery.limit(query.limit + 1); // +1 to check if there are more events

    const results = await nftsQuery.get();
    const data = results.docs.map((item) => item.data() as NftDto);
    const hasNextPage = data.length > query.limit;
    if (hasNextPage) {
      data.pop();
    }

    const cursor: Cursor = {} as any;
    const lastItem = data[data.length - 1];
    for (const key of Object.values(NftsOrderBy)) {
      switch (key) {
        case NftsOrderBy.Price: {
          const startPrice = lastItem?.ordersSnippet?.[orderType]?.orderItem?.startPriceEth;
          const tokenId = lastItem?.tokenIdNumeric;
          if (startPrice && tokenId) {
            cursor[NftsOrderBy.Price] = startPrice;
            cursor[NftsOrderBy.TokenIdNumeric] = tokenId;
          }
          break;
        }
        case NftsOrderBy.TokenIdNumeric: {
          if (lastItem?.[key]) {
            cursor[key] = lastItem[key] ?? '';
          }
          break;
        }
        default: {
          cursor[NftsOrderBy.DocId] = results.docs[results.docs.length - 1]?.id;
          break;
        }
      }
    }
    const encodedCursor = this.paginationService.encodeCursor(cursor);

    // backfill any missing data
    this.backfillService.backfillAnyMissingNftData(data).catch((err) => {
      console.error('Error backfilling missing nft data', err);
    });
    this.backfillService.backfillAnyInvalidNfts(collection.chainId, collection.address).catch((err) => {
      console.error('Error backfilling invalid nfts', err);
    });

    return {
      data,
      cursor: encodedCursor,
      hasNextPage,
      totalOwned: NaN
    };
  }

  async getReservoirCollectionNfts(collection: ParsedCollectionId, query: NftsQueryDto): Promise<NftArrayDto> {
    const result = await getReservoirTokens(collection.address, query.limit, query.cursor ?? '');

    return {
      data: result.nfts,
      cursor: result.cursor,
      hasNextPage: result.nfts.length > 0,
      totalOwned: NaN
    };
  }

  async getNftActivity(nftQuery: NftActivityQueryDto, filter: NftActivityFiltersDto) {
    const eventTypes = typeof filter.eventType === 'string' ? [filter.eventType] : filter.eventType;
    let events = eventTypes?.filter((item) => !!item);

    if (filter.socialsOnly) {
      const limit = Math.floor((filter.limit ?? 10) / 2); // get 5 tweets, 5 discord messages
      return getNftSocialActivity({
        firestore: this.firebaseService.firestore,
        paginationService: this.paginationService,
        limit,
        events,
        tokenId: nftQuery.tokenId,
        collectionAddress: nftQuery.address,
        chainId: nftQuery.chainId
      });
    } else {
      // slice because firestore 'IN' query can only support 10 items
      events = events && events.length > 10 ? events.slice(0, 10) : events;

      return getNftActivity({
        firestore: this.firebaseService.firestore,
        paginationService: this.paginationService,
        limit: filter.limit,
        events,
        cursor: filter.cursor,
        tokenId: nftQuery.tokenId,
        collectionAddress: nftQuery.address,
        chainId: nftQuery.chainId,
        source: filter.source
      });
    }
  }
}
