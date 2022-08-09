import { ChainId } from '@infinityxyz/lib/types/core';
import { EventType, NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core/feed';
import { NftActivity, NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { FirestoreDistributedCounter } from 'firebase/firestore-counter';
import { CursorService } from 'pagination/cursor.service';
import { IncrementQuery, LikedLock } from './feed.types';

@Injectable()
export class FeedService {
  constructor(private firebaseService: FirebaseService, private paginationService: CursorService) {}

  public async incrementLikes(query: IncrementQuery) {
    const likeLockRef = this.firebaseService.firestore
      .collection(firestoreConstants.FEED_COLL)
      .doc(query.eventId)
      .collection('likeLocks')
      .doc(query.userAddress);

    const likeLock = await likeLockRef.get();
    const lockData = likeLock.data() as LikedLock;

    if (!lockData) {
      await likeLockRef.set({ liked: query.liked } as LikedLock);

      this.incrementLikesCounter(query.liked ? 1 : -1, query.eventId);
    } else {
      if (lockData.liked !== query.liked) {
        await likeLockRef.set({ liked: query.liked } as LikedLock);

        this.incrementLikesCounter(query.liked ? 2 : -2, query.eventId);
      }
    }
  }

  private incrementLikesCounter(increment: number, docId: string) {
    const docRef = this.firebaseService.firestore.collection(firestoreConstants.FEED_COLL).doc(docId);

    const numLikes = new FirestoreDistributedCounter(docRef, 'likes');

    numLikes.incrementBy(increment);
  }

  async getActivity(filter: NftActivityFiltersDto) {
    const eventTypes = typeof filter.eventType === 'string' ? [filter.eventType] : filter.eventType;
    const events = eventTypes?.filter((item) => !!item);

    let activityQuery = this.firebaseService.firestore
      .collection(firestoreConstants.FEED_COLL)
      .where('type', 'in', events)
      .orderBy('timestamp', 'desc');

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
            collectionName: sale.collectionName,
            collectionSlug: sale.collectionSlug,
            image: sale.image,
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
            collectionName: listing.collectionName,
            collectionSlug: listing.collectionSlug,
            image: listing.image,
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
            collectionName: offer.collectionName,
            collectionSlug: offer.collectionSlug,
            image: offer.image,
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

    // commenting since not sure why its needed
    // fill in collection data
    // const activitiesCollAddresses = activities.map((act) => ({ address: act?.address ?? '', chainId: act.chainId }));
    // const { getCollection } = await this.collectionsService.getCollectionsByAddress(activitiesCollAddresses);
    // for (const act of activities) {
    //   const collectionData = getCollection({
    //     address: act.address ?? '',
    //     chainId: act.chainId
    //   }) as Collection;
    //   act.collectionData = collectionData;
    // }

    const rawCursor = `${activities?.[activities?.length - 1]?.timestamp ?? ''}`;
    const cursor = this.paginationService.encodeCursor(rawCursor);

    return {
      data: activities,
      hasNextPage,
      cursor
    };
  }
}
