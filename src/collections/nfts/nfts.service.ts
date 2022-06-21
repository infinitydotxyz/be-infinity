import { ChainId, CreationFlow } from '@infinityxyz/lib/types/core';
import { NftActivityQueryDto, OrderType } from '@infinityxyz/lib/types/dto/collections/nfts';
import { FeedEventType, NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core/feed';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import CollectionsService from 'collections/collections.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ActivityType, activityTypeToEventType } from './nft-activity.types';
import { CursorService } from 'pagination/cursor.service';
import { EthereumService } from 'ethereum/ethereum.service';
import { BackfillService } from 'backfill/backfill.service';
import {
  NftQueryDto,
  NftDto,
  ExternalNftDto,
  NftsQueryDto,
  NftArrayDto,
  NftsOrderBy,
  NftActivityFiltersDto,
  NftActivity
} from '@infinityxyz/lib/types/dto/collections/nfts';

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
    const collection = await this.collectionsService.getCollectionByAddress(nftQuery);
    if (collection) {
      const nfts = await this.getNfts([
        { address: collection.address, chainId: collection.chainId as ChainId, tokenId: nftQuery.tokenId }
      ]);
      const nft = nfts?.[0];
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
    }
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

  async isSupported(nfts: NftDto[]) {
    const { getCollection } = await this.collectionsService.getCollectionsByAddress(
      nfts.map((nft) => ({ address: nft.collectionAddress ?? '', chainId: nft.chainId }))
    );

    const externalNfts: ExternalNftDto[] = nfts.map((nft) => {
      const collection = getCollection({ address: nft.collectionAddress ?? '', chainId: nft.chainId });
      const isSupported = collection?.state?.create?.step === CreationFlow.Complete;
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
    const complete = snapshots.map((item) => item.exists).every((item) => item === true);
    if (!complete) {
      return this.backfillService.backfillNfts(nfts);
    }

    const nftDtos = snapshots.map((snapshot, index) => {
      const nft = snapshot.data() as NftDto | undefined;
      if (nft) {
        nft.collectionAddress = nfts[index].address;
      }
      return nft;
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
    const startPriceField = `ordersSnippet.${orderType}.orderItem.startPriceEth`;
    if (query.orderType) {
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
    }
    let orderBy: string = query.orderBy;
    if (orderBy === NftsOrderBy.Price) {
      orderBy = startPriceField;
    }
    nftsQuery = nftsQuery.orderBy(orderBy, query.orderDirection);
    if (decodedCursor?.[query.orderBy]) {
      nftsQuery = nftsQuery.startAfter(decodedCursor[query.orderBy]);
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
          if (startPrice) {
            cursor[NftsOrderBy.Price] = startPrice;
          }
          break;
        }
        case NftsOrderBy.RarityRank:
        case NftsOrderBy.TokenId:
          if (lastItem?.[key]) {
            cursor[key] = lastItem[key];
          }
          break;
      }
    }
    const encodedCursor = this.paginationService.encodeCursor(cursor);
    return {
      data,
      cursor: encodedCursor,
      hasNextPage
    };
  }

  async getNftActivity(nftQuery: NftActivityQueryDto, filter: NftActivityFiltersDto) {
    const eventTypes = typeof filter.eventType === 'string' ? [filter.eventType] : filter.eventType;
    const events = eventTypes?.map((item) => activityTypeToEventType[item]).filter((item) => !!item);

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

    const data = results.docs.map((item) => item.data());
    const activities: FirebaseFirestore.DocumentData[] = [];

    data.forEach((item) => {
      let activity: NftActivity | null;
      if (
        item.type !== FeedEventType.NftSale &&
        item.type !== FeedEventType.NftListing &&
        item.type !== FeedEventType.NftOffer
      ) {
        return null;
      }
      switch (item.type) {
        case FeedEventType.NftSale: {
          const sale: NftSaleEvent = item as any;
          activity = {
            address: sale.collectionAddress,
            tokenId: sale.tokenId,
            chainId: sale.chainId as ChainId,
            type: ActivityType.Sale,
            from: sale.seller,
            fromDisplayName: sale.sellerDisplayName,
            to: sale.buyer,
            toDisplayName: sale.buyerDisplayName,
            price: sale.price,
            paymentToken: sale.paymentToken,
            internalUrl: sale.internalUrl,
            externalUrl: sale.externalUrl,
            timestamp: sale.timestamp
          };
          break;
        }
        case FeedEventType.NftListing: {
          const listing: NftListingEvent = item as any;
          activity = {
            address: listing.collectionAddress,
            tokenId: listing.tokenId,
            chainId: listing.chainId as ChainId,
            type: ActivityType.Listing,
            from: listing.makerAddress,
            fromDisplayName: listing.makerUsername,
            to: listing.takerAddress ?? '',
            toDisplayName: listing.takerUsername,
            price: listing.startPriceEth,
            paymentToken: listing.paymentToken,
            internalUrl: listing.internalUrl,
            externalUrl: '',
            timestamp: listing.timestamp
          };
          break;
        }

        case FeedEventType.NftOffer: {
          const offer: NftOfferEvent = item as any;
          activity = {
            address: offer.collectionAddress,
            tokenId: offer.tokenId,
            chainId: offer.chainId as ChainId,
            type: ActivityType.Offer,
            from: offer.makerAddress,
            fromDisplayName: offer.makerUsername,
            to: offer.takerAddress ?? '',
            toDisplayName: offer.takerUsername,
            price: offer.startPriceEth,
            paymentToken: offer.paymentToken,
            internalUrl: offer.internalUrl,
            externalUrl: '',
            timestamp: offer.timestamp
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

    const hasNextPage = data.length > filter.limit;

    if (hasNextPage) {
      activities.pop(); // Remove item used for pagination
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
