import { ChainId } from '@infinityxyz/lib/types/core';
import {
  CoinMarketCapNewsEvent,
  DiscordAnnouncementEvent,
  EventType,
  NftListingEvent,
  NftOfferEvent,
  NftSaleEvent,
  NftTransferEvent,
  TwitterTweetEvent,
  UserStakedEvent,
  UserVoteEvent
} from '@infinityxyz/lib/types/core/feed';
import { NftActivity, NftActivityArrayDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { CursorService } from 'pagination/cursor.service';

interface Props {
  firestore: FirebaseFirestore.Firestore;
  paginationService: CursorService;
  limit: number;
  events: EventType[];
  cursor?: string;
  tokenId?: string;
  collectionAddress?: string;
  chainId?: string;
  source?: string;
}

export const getNftActivity = async ({
  firestore,
  paginationService,
  limit,
  events,
  cursor,
  tokenId,
  collectionAddress,
  chainId,
  source
}: Props): Promise<NftActivityArrayDto> => {
  let activityQuery = firestore.collection(firestoreConstants.FEED_COLL).where('type', 'in', events);

  if (collectionAddress) {
    activityQuery = activityQuery.where('collectionAddress', '==', collectionAddress);
  }

  if (chainId) {
    activityQuery = activityQuery.where('chainId', '==', chainId);
  }

  if (tokenId) {
    activityQuery = activityQuery.where('tokenId', '==', tokenId);
  }

  // this will only return sales, not other events
  if (source && events.findIndex((x) => x === EventType.NftSale) !== -1) {
    activityQuery = activityQuery.where('source', '==', source);
  }

  activityQuery = activityQuery.orderBy('timestamp', 'desc').limit(limit + 1); // +1 to check if there are more events

  if (cursor) {
    const decodedCursor = paginationService.decodeCursorToNumber(cursor);
    activityQuery = activityQuery.startAfter(decodedCursor);
  }

  const results = await activityQuery.get();

  const activities: NftActivity[] = [];

  results.docs.forEach((snap) => {
    const item = snap.data();

    const activity = typeToActivity(item, snap.id);

    // return activity;
    if (activity) {
      activities.push(activity);
    }
  });

  const hasNextPage = results.docs.length > limit;

  if (hasNextPage) {
    activities.pop(); // Remove item used for pagination
  }

  const rawCursor = `${activities?.[activities?.length - 1]?.timestamp ?? ''}`;
  const resultCursor = paginationService.encodeCursor(rawCursor);

  return {
    data: activities,
    hasNextPage,
    cursor: resultCursor
  };
};

// =============================================================================

export const typeToActivity = (item: any, id: string): NftActivity | null => {
  let activity: NftActivity | null = null;

  // this is reqd because some old data in firebase has wrong internal url for asset activity type
  const assetInternalUrlBase = 'https://flow.so';

  switch (item.type) {
    case EventType.NftSale: {
      const sale: NftSaleEvent = item;
      activity = {
        id: id,
        type: EventType.NftSale,
        address: sale.collectionAddress,
        collectionName: sale.collectionName,
        collectionSlug: sale.collectionSlug,
        hasBlueCheck: sale.hasBlueCheck,
        image: sale.image,
        tokenId: sale.tokenId,
        chainId: sale.chainId as ChainId,
        from: sale.seller,
        fromDisplayName: sale.sellerDisplayName,
        to: sale.buyer,
        toDisplayName: sale.buyerDisplayName,
        price: sale.price,
        paymentToken: sale.paymentToken,
        internalUrl: `${assetInternalUrlBase}/${sale.chainId}/${sale.collectionAddress}/${sale.tokenId}`,
        externalUrl: sale.externalUrl,
        timestamp: sale.timestamp,
        likes: sale.likes,
        comments: sale.comments,
        source: sale.source
      };
      break;
    }
    case EventType.NftListing: {
      const listing: NftListingEvent = item;
      activity = {
        id: id,
        type: EventType.NftListing,
        address: listing.collectionAddress,
        collectionName: listing.collectionName,
        collectionSlug: listing.collectionSlug,
        hasBlueCheck: listing.hasBlueCheck,
        image: listing.image,
        tokenId: listing.tokenId,
        chainId: listing.chainId as ChainId,
        from: listing.makerAddress,
        fromDisplayName: listing.makerUsername,
        to: listing.takerAddress ?? '',
        toDisplayName: listing.takerUsername,
        price: listing.startPriceEth,
        paymentToken: listing.paymentToken,
        internalUrl: `${assetInternalUrlBase}/${listing.chainId}/${listing.collectionAddress}/${listing.tokenId}`,
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
        type: EventType.NftOffer,
        address: offer.collectionAddress,
        collectionName: offer.collectionName,
        collectionSlug: offer.collectionSlug,
        hasBlueCheck: offer.hasBlueCheck,
        image: offer.image || offer.collectionProfileImage,
        tokenId: offer.tokenId,
        chainId: offer.chainId as ChainId,
        from: offer.makerAddress,
        fromDisplayName: offer.makerUsername,
        to: offer.takerAddress ?? '',
        toDisplayName: offer.takerUsername,
        price: offer.startPriceEth,
        paymentToken: offer.paymentToken,
        internalUrl: `${assetInternalUrlBase}/${offer.chainId}/${offer.collectionAddress}/${offer.tokenId}`,
        externalUrl: '',
        timestamp: offer.timestamp,
        likes: offer.likes,
        comments: offer.comments
      };
      break;
    }

    case EventType.NftTransfer: {
      const transfer: NftTransferEvent = item;
      activity = {
        id: id,
        type: EventType.NftTransfer,
        address: transfer.collectionAddress,
        collectionName: transfer.collectionName,
        collectionSlug: transfer.collectionSlug,
        hasBlueCheck: transfer.hasBlueCheck,
        image: transfer.image,
        tokenId: transfer.tokenId,
        chainId: transfer.chainId as ChainId,
        from: transfer.from,
        fromDisplayName: transfer.fromDisplayName,
        to: transfer.to ?? '',
        toDisplayName: transfer.toDisplayName,
        price: 0,
        paymentToken: '',
        internalUrl: `${assetInternalUrlBase}/${transfer.chainId}/${transfer.collectionAddress}/${transfer.tokenId}`,
        externalUrl: transfer.externalUrl,
        timestamp: transfer.timestamp,
        likes: transfer.likes,
        comments: transfer.comments
      };
      break;
    }
    case EventType.TwitterTweet: {
      const tweet: TwitterTweetEvent = item;
      activity = {
        id: id,
        type: EventType.TwitterTweet,
        address: tweet.collectionAddress,
        collectionName: tweet.collectionName,
        collectionSlug: tweet.collectionSlug,
        hasBlueCheck: tweet.hasBlueCheck,
        image: tweet.image,
        tokenId: `https://twitter.com/${tweet.username}/status/${tweet.id}`,
        chainId: tweet.chainId as ChainId,
        from: tweet.username,
        fromDisplayName: tweet.authorName,
        to: tweet.text,
        toDisplayName: tweet.source,
        price: 0,
        paymentToken: tweet.authorProfileImage,
        internalUrl: tweet.internalUrl,
        externalUrl: tweet.externalLink,
        timestamp: tweet.timestamp,
        likes: tweet.likes,
        comments: tweet.comments
      };
      break;
    }
    case EventType.DiscordAnnouncement: {
      const discord: DiscordAnnouncementEvent = item;
      activity = {
        id: id,
        type: EventType.DiscordAnnouncement,
        address: '',
        collectionName: discord.collectionName ?? '',
        collectionSlug: discord.collectionSlug ?? '',
        hasBlueCheck: false,
        image: discord.collectionProfileImage ?? '',
        tokenId: '',
        chainId: {} as ChainId,
        from: discord.guildId,
        fromDisplayName: discord.authorId,
        to: '',
        toDisplayName: '',
        price: 0,
        paymentToken: discord.author,
        internalUrl: discord.content,
        externalUrl: '',
        timestamp: discord.timestamp,
        likes: discord.likes,
        comments: discord.comments
      };
      break;
    }
    case EventType.CoinMarketCapNews: {
      const coin: CoinMarketCapNewsEvent = item;
      activity = {
        id: id,
        type: EventType.CoinMarketCapNews,
        address: '',
        collectionName: '',
        collectionSlug: '',
        hasBlueCheck: false,
        image: coin.cover ?? '',
        tokenId: '',
        chainId: {} as ChainId,
        from: coin.content,
        fromDisplayName: coin.sourceName,
        to: '',
        toDisplayName: coin.releasedAt,
        price: 0,
        paymentToken: coin.title,
        internalUrl: coin.subtitle,
        externalUrl: coin.sourceUrl,
        timestamp: coin.timestamp,
        likes: coin.likes,
        comments: coin.comments
      };
      break;
    }
    case EventType.UserVote: {
      const vote: UserVoteEvent = item;
      activity = {
        id: id,
        type: EventType.UserVote,
        address: vote.collectionAddress,
        collectionName: vote.collectionName,
        collectionSlug: vote.collectionSlug,
        hasBlueCheck: vote.hasBlueCheck,
        tokenId: '',
        image: vote.collectionProfileImage,
        chainId: vote.chainId as ChainId,
        from: vote.userAddress,
        fromDisplayName: vote.userDisplayName || vote.userUsername,
        to: vote.userProfileImage,
        toDisplayName: vote.usersInvolved?.length.toString() ?? '',
        price: vote.votesAdded,
        paymentToken: vote.userUsername,
        internalUrl: vote.internalUrl,
        externalUrl: '',
        timestamp: vote.timestamp,
        likes: vote.likes,
        comments: vote.comments
      };
      break;
    }
    case EventType.TokensStaked: {
      const stake: UserStakedEvent = item;

      activity = {
        id: id,
        type: EventType.TokensStaked,
        address: '',
        collectionName: '',
        collectionSlug: '',
        hasBlueCheck: false,
        tokenId: '',
        chainId: '' as ChainId,
        from: stake.userAddress,
        fromDisplayName: stake.userDisplayName || stake.userUsername,
        to: '',
        image: stake.userProfileImage,
        toDisplayName: '',
        price: stake.duration,
        paymentToken: stake.amount,
        internalUrl: '',
        externalUrl: stake.stakePower.toString(),
        timestamp: stake.timestamp,
        likes: stake.likes,
        comments: stake.comments
      };
      break;
    }

    default:
      console.log(`Activity transformation not implemented type: ${item.type}`);
      // throw new Error(`Activity transformation not implemented type: ${item.type}`);
      break;
  }

  return activity;
};
