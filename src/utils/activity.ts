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
import { NftActivity } from '@infinityxyz/lib/types/dto/collections/nfts';

export const typeToActivity = (item: any, id: string): NftActivity | null => {
  let activity: NftActivity | null = null;

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
        type: EventType.NftOffer,
        address: offer.collectionAddress,
        collectionName: offer.collectionName,
        collectionSlug: offer.collectionSlug,
        hasBlueCheck: offer.hasBlueCheck,
        image: offer.image,
        tokenId: offer.tokenId,
        chainId: offer.chainId as ChainId,
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
        internalUrl: transfer.internalUrl,
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
        tokenId: '',
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
