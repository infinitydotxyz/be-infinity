import { ChainId, Collection, CollectionStats, CreationFlow, TokenStandard } from '@infinityxyz/lib/types/core';
import { ReservoirCollectionV6 } from 'reservoir/types';

export function reservoirCollToERC721CollectionAndStats(
  chainId: string,
  resvCollection: ReservoirCollectionV6
): Collection & Partial<CollectionStats> {
  return {
    tokenStandard: TokenStandard.ERC721,
    chainId: chainId as ChainId,
    address: resvCollection.id,
    hasBlueCheck: resvCollection.openseaVerificationStatus === 'verified',
    deployedAt: resvCollection.mintedTimestamp,
    slug: resvCollection?.slug || '',
    numSales: parseInt(String(resvCollection.salesCount?.allTime)),
    numNfts: parseInt(String(resvCollection.tokenCount)),
    numOwners: parseInt(String(resvCollection.ownerCount)),
    floorPrice: resvCollection.floorAsk.price?.amount?.native,
    volume:
      typeof resvCollection?.volume?.allTime === 'string'
        ? parseFloat(resvCollection.volume.allTime)
        : resvCollection?.volume?.allTime ?? NaN,
    metadata: {
      name: resvCollection.name,
      description: resvCollection.description,
      profileImage: resvCollection.image,
      symbol: '',
      bannerImage: '',
      links: {
        timestamp: new Date().getTime(),
        discord: resvCollection.discordUrl || '',
        external: resvCollection.externalUrl || '',
        medium: '',
        slug: resvCollection?.slug || '',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        telegram: '',
        twitter:
          typeof resvCollection?.twitterUsername === 'string'
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              `https://twitter.com/${resvCollection.twitterUsername.toLowerCase()}`
            : '',
        instagram: '',
        wiki: ''
      }
    },
    deployer: '',
    owner: '',
    numOwnersUpdatedAt: 0,
    deployedAtBlock: 0,
    numTraitTypes: Number(resvCollection.attributes?.length ?? 0),
    indexInitiator: '',
    state: {
      version: 0,
      create: {
        step: CreationFlow.Complete,
        updatedAt: 0,
        progress: 100
      },
      export: {
        done: false
      }
    }
  };
}
