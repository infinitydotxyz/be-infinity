import { ChainId } from '@infinityxyz/lib/types/core';
import { EventType, NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core/feed';
import { NftActivity } from '@infinityxyz/lib/types/dto/collections/nfts';

export const typeToActivity = (item: any, id: string): NftActivity | null => {
  let activity: NftActivity | null;

  switch (item.type) {
    case EventType.NftSale: {
      const sale: NftSaleEvent = item;
      activity = {
        id: id,
        address: sale.collectionAddress,
        collectionName: sale.collectionName,
        collectionSlug: sale.collectionSlug,
        hasBlueCheck: sale.hasBlueCheck,
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
      const listing: NftListingEvent = item;
      activity = {
        id: id,
        address: listing.collectionAddress,
        collectionName: listing.collectionName,
        collectionSlug: listing.collectionSlug,
        hasBlueCheck: listing.hasBlueCheck,
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
      const offer: NftOfferEvent = item;
      activity = {
        id: id,
        address: offer.collectionAddress,
        collectionName: offer.collectionName,
        collectionSlug: offer.collectionSlug,
        hasBlueCheck: offer.hasBlueCheck,
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
      break;
  }

  return activity;
};
