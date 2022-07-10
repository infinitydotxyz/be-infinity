import { ChainId, Collection, OrderDirection } from '@infinityxyz/lib/types/core';
import { EventType, NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core/feed';
import {
  ExternalNftDto,
  NftActivity,
  NftActivityFiltersDto,
  NftActivityQueryDto,
  NftArrayDto,
  NftDto,
  NftQueryDto,
  NftsOrderBy,
  NftsQueryDto,
  OrderType
} from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { BackfillService } from 'backfill/backfill.service';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import CollectionsService from 'collections/collections.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';

@Injectable()
export class NftsService {
  constructor(
    private firebaseService: FirebaseService,
    private collectionsService: CollectionsService,
    private paginationService: CursorService,
    private ethereumService: EthereumService,
    private backfillService: BackfillService
  ) {}

  async getNft(nftQuery: NftQueryDto): Promise<NftDto | undefined> {
    // const collection = await this.collectionsService.getCollectionByAddress(nftQuery, {
    //   limitToCompleteCollections: false
    // });
    // if (collection) {
    const [nft] = await this.getNfts([
      { address: nftQuery.address, chainId: nftQuery.chainId, tokenId: nftQuery.tokenId }
    ]);

    if (nft && !nft.owner) {
      const owner = await this.ethereumService.getErc721Owner({
        address: nftQuery.address,
        tokenId: nftQuery.tokenId,
        chainId: nftQuery.chainId
      });
      if (owner) {
        nft.owner = owner;
        this.updateOwnershipInFirestore(nft);
      }
    }

    return nft;
    // }
  }

  updateOwnershipInFirestore(nft: NftDto): void {
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

  async getNfts(nfts: { address: string; chainId: ChainId; tokenId: string }[]): Promise<(NftDto | undefined)[]> {
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

    const nftDtos = [];
    const nftsToBackfill = [];

    for (const nft of nftsMergedWithSnapshot) {
      if (nft && (nft.image?.url || nft.image?.originalUrl)) {
        nftDtos.push(nft);
      } else {
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

    return nftDtos;
  }

  async getCollectionNfts(collection: ParsedCollectionId, query: NftsQueryDto): Promise<NftArrayDto> {
    type Cursor = Record<NftsOrderBy, string | number>;
    const nftsCollection = collection.ref.collection(firestoreConstants.COLLECTION_NFTS_COLL);
    const decodedCursor = this.paginationService.decodeCursorToObject<Cursor>(query.cursor);
    let nftsQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = nftsCollection;

    if (query.orderBy === NftsOrderBy.Price && !query.orderType) {
      query.orderType = OrderType.Listing;
    }
    const orderType = query.orderType || OrderType.Listing;

    const startPriceField = `ordersSnippet.${query.orderType}.orderItem.startPriceEth`;

    if (query.orderType) {
      nftsQuery = nftsQuery.where(`ordersSnippet.${query.orderType}.hasOrder`, '==', true);
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
            const traitTypeObj = traitType ? { trait_type: traitType } : {};
            traits.push({
              value: traitValue,
              ...traitTypeObj
            });
          }
        }
      }
      if (traits.length > 0) {
        nftsQuery = nftsQuery.where('metadata.attributes', 'array-contains-any', traits);
      }
    }

    const hasPriceFilter = query.minPrice !== undefined || query.maxPrice !== undefined;
    if (hasPriceFilter) {
      const minPrice = query.minPrice ?? 0;
      const maxPrice = query.maxPrice ?? Number.MAX_SAFE_INTEGER;
      nftsQuery = nftsQuery.where(startPriceField, '>=', minPrice);
      nftsQuery = nftsQuery.where(startPriceField, '<=', maxPrice);
      nftsQuery = nftsQuery.orderBy(NftsOrderBy.Price, query.orderDirection);
      nftsQuery = nftsQuery.orderBy(NftsOrderBy.TokenId, OrderDirection.Ascending); // to break ties
      const startAfterPrice = decodedCursor?.[NftsOrderBy.Price];
      const startAfterTokenId = decodedCursor?.[NftsOrderBy.TokenId];
      if (startAfterPrice && startAfterTokenId) {
        nftsQuery = nftsQuery.startAfter(startAfterPrice, startAfterTokenId);
      }
    } else {
      nftsQuery = nftsQuery.orderBy(query.orderBy, query.orderDirection);
      if (decodedCursor?.[query.orderBy]) {
        nftsQuery = nftsQuery.startAfter(decodedCursor[query.orderBy]);
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
          const tokenId = lastItem?.tokenId;
          if (startPrice && tokenId) {
            cursor[NftsOrderBy.Price] = startPrice;
            cursor[NftsOrderBy.TokenId] = tokenId;
          }
          break;
        }
        case NftsOrderBy.RarityRank:
        case NftsOrderBy.TokenId:
        case NftsOrderBy.TokenIdNumeric:
          if (lastItem?.[key]) {
            cursor[key] = lastItem[key] ?? '';
          }
          break;
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

  async getNftActivity(nftQuery: NftActivityQueryDto, filter: NftActivityFiltersDto) {
    const eventTypes = typeof filter.eventType === 'string' ? [filter.eventType] : filter.eventType;
    const events = eventTypes?.filter((item) => !!item);

    let activityQuery = null;

    if (nftQuery.tokenId) {
      // query for NFT Token Activity
      activityQuery = this.firebaseService.firestore
        .collection(firestoreConstants.FEED_COLL)
        .where('collectionAddress', '==', nftQuery.address)
        .where('chainId', '==', nftQuery.chainId)
        .where('tokenId', '==', nftQuery.tokenId)
        .where('type', 'in', events)
        .orderBy('timestamp', 'desc');
    } else {
      // query for Collection Activity
      activityQuery = this.firebaseService.firestore
        .collection(firestoreConstants.FEED_COLL)
        .where('collectionAddress', '==', nftQuery.address)
        .where('chainId', '==', nftQuery.chainId)
        .where('type', 'in', events)
        .orderBy('timestamp', 'desc');
    }

    activityQuery = activityQuery.limit(filter.limit); // +1 to check if there are more events

    if (filter.cursor) {
      const decodedCursor = this.paginationService.decodeCursorToNumber(filter.cursor);
      activityQuery = activityQuery.startAfter(decodedCursor);
    }

    const results = await activityQuery.get();

    const activities: FirebaseFirestore.DocumentData[] = [];

    results.docs.forEach((snap) => {
      const item = snap.data();

      let activity: NftActivity | null;
      if (item.type !== EventType.NftSale && item.type !== EventType.NftListing && item.type !== EventType.NftOffer) {
        return null;
      }
      switch (item.type) {
        case EventType.NftSale: {
          const sale: NftSaleEvent = item as any;
          activity = {
            id: snap.id,
            address: sale.collectionAddress,
            tokenId: sale.tokenId,
            chainId: sale.chainId as ChainId,
            type: EventType.NftSale,
            from: sale.seller,
            fromDisplayName: sale.sellerDisplayName,
            to: sale.buyer,
            toDisplayName: sale.buyerDisplayName,
            price: sale.price,
            paymentToken: sale.paymentToken,
            internalUrl: sale.internalUrl,
            externalUrl: sale.externalUrl,
            timestamp: sale.timestamp,
            likes: sale.likes,
            comments: sale.comments
          };
          break;
        }
        case EventType.NftListing: {
          const listing: NftListingEvent = item as any;
          activity = {
            id: snap.id,
            address: listing.collectionAddress,
            tokenId: listing.tokenId,
            chainId: listing.chainId as ChainId,
            type: EventType.NftListing,
            from: listing.makerAddress,
            fromDisplayName: listing.makerUsername,
            to: listing.takerAddress ?? '',
            toDisplayName: listing.takerUsername,
            price: listing.startPriceEth,
            paymentToken: listing.paymentToken,
            internalUrl: listing.internalUrl,
            externalUrl: '',
            timestamp: listing.timestamp,
            likes: listing.likes,
            comments: listing.comments
          };
          break;
        }

        case EventType.NftOffer: {
          const offer: NftOfferEvent = item as any;
          activity = {
            id: snap.id,
            address: offer.collectionAddress,
            tokenId: offer.tokenId,
            chainId: offer.chainId as ChainId,
            type: EventType.NftOffer,
            from: offer.makerAddress,
            fromDisplayName: offer.makerUsername,
            to: offer.takerAddress ?? '',
            toDisplayName: offer.takerUsername,
            price: offer.startPriceEth,
            paymentToken: offer.paymentToken,
            internalUrl: offer.internalUrl,
            externalUrl: '',
            timestamp: offer.timestamp,
            likes: offer.likes,
            comments: offer.comments
          };
          break;
        }
        default:
          activity = null;
        // throw new Error(`Activity transformation not implemented type: ${item.type}`);
      }
      // return activity;
      if (activity) {
        activities.push(activity);
      }
    });

    const hasNextPage = results.docs.length > filter.limit;

    if (hasNextPage) {
      activities.pop(); // Remove item used for pagination
    }

    // fill in collection data
    const activitiesCollAddresses = activities.map((act) => ({ address: act?.address ?? '', chainId: act.chainId }));
    const { getCollection } = await this.collectionsService.getCollectionsByAddress(activitiesCollAddresses);
    for (const act of activities) {
      const collectionData = getCollection({
        address: act.address ?? '',
        chainId: act.chainId
      }) as Collection;
      act.collectionData = collectionData;
    }

    const rawCursor = `${activities?.[activities?.length - 1]?.timestamp ?? ''}`;
    const cursor = this.paginationService.encodeCursor(rawCursor);

    return {
      data: activities,
      hasNextPage,
      cursor
    };
  }
}
