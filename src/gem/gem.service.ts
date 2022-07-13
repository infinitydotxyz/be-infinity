import { BaseCollection, ChainId, CollectionMetadata, TokenStandard } from '@infinityxyz/lib/types/core';
import { getSearchFriendlyString, sleep } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import got, { Got, Response } from 'got/dist/source';
import { GEM_API_KEY } from '../constants';
import { gotErrorHandler } from '../utils/got';
import { GemCollectionResponse } from './gem.types';

@Injectable()
export class GemService {
  private readonly client: Got;

  constructor() {
    this.client = got.extend({
      prefixUrl: 'https://gem-public-api.herokuapp.com/',
      hooks: {
        beforeRequest: [
          (options: any) => {
            if (!options?.headers?.['x-api-key']) {
              if (!options.headers) {
                options.headers = {};
              }

              options.headers['x-api-key'] = GEM_API_KEY;
            }
          }
        ]
      },
      /**
       * requires us to check status code
       */
      throwHttpErrors: false,
      cache: false,
      timeout: 20_000
    });
  }

  async getCollectionWithAddress(chainId: ChainId, address: string): Promise<Partial<BaseCollection | undefined>> {
    if (!ethers.utils.isAddress(address)) {
      throw new Error('Invalid address');
    }

    const response = await this.errorHandler(() => {
      return this.client.post(`collections`, {
        json: {
          filters: {
            address
          },
          limit: 1,
          fields: {
            name: 1,
            symbol: 1,
            standard: 1,
            description: 1,
            address: 1,
            createdDate: 1,
            externalUrl: 1,
            imageUrl: 1,
            totalSupply: 1,
            stats: 1,
            indexingStatus: 1,
            discordUrl: 1,
            instagramUsername: 1,
            isVerified: 1,
            mediumUsername: 1,
            telegramUrl: 1,
            twitterUsername: 1,
            wikiUrl: 1
          }
        },
        responseType: 'json'
      });
    });

    const gemCollectionResp = response.body as GemCollectionResponse;
    const gemCollection = gemCollectionResp.data[0];

    if (gemCollection) {
      const dataInInfinityFormat: CollectionMetadata = {
        name: gemCollection.name,
        description: gemCollection.description,
        symbol: gemCollection.symbol,
        profileImage: gemCollection.imageUrl,
        bannerImage: '',
        links: {
          timestamp: new Date().getTime(),
          discord: gemCollection.discordUrl,
          external: gemCollection.externalUrl,
          medium:
            typeof gemCollection.mediumUsername === 'string'
              ? `https://medium.com/${gemCollection.mediumUsername}`
              : '',
          slug: '',
          telegram: gemCollection.telegramUrl,
          twitter:
            typeof gemCollection.twitterUsername === 'string'
              ? `https://twitter.com/${gemCollection.twitterUsername}`
              : '',
          instagram:
            typeof gemCollection.instagramUsername === 'string'
              ? `https://instagram.com/${gemCollection.instagramUsername}`
              : '',
          wiki: gemCollection.wikiUrl
        }
      };

      const hasBlueCheck = gemCollection.isVerified;

      return {
        chainId,
        address,
        tokenStandard: gemCollection.standard as TokenStandard,
        hasBlueCheck,
        deployer: '',
        deployedAt: NaN,
        deployedAtBlock: NaN,
        owner: '',
        numOwners: gemCollection.stats.num_owners,
        numOwnersUpdatedAt: Date.now(),
        metadata: dataInInfinityFormat,
        slug: getSearchFriendlyString(gemCollection.name),
        numNfts: gemCollection.totalSupply,
        attributes: {},
        numTraitTypes: NaN,
        indexInitiator: ''
      };
    }
  }

  // async getNFT(address: string, tokenId: string): Promise<GemAsset | undefined> {
  //   const res: Response<GemAsset> = await this.errorHandler(() => {
  //     return this.client.post(`assets`, {
  //       json: {
  //         filters: {
  //           address,
  //           searchText: tokenId
  //         },
  //         fields: {
  //           id: 1,
  //           address: 1,
  //           name: 1,
  //           description: 1,
  //           collectionName: 1,
  //           collectionSymbol: 1,
  //           externalLink: 1,
  //           smallImageUrl: 1,
  //           animationUrl: 1,
  //           tokenMetadata: 1,
  //           standard: 1,
  //           imageUrl: 1
  //         },
  //         limit: 1,
  //         offset: 0
  //       },
  //       responseType: 'json'
  //     });
  //   });

  //   return res.body;
  // }

  private async errorHandler<T>(request: () => Promise<Response<T>>, maxAttempts = 3): Promise<Response<T>> {
    let attempt = 0;

    for (;;) {
      attempt += 1;

      try {
        const res: Response<T> = await request();

        switch (res.statusCode) {
          case 200:
            return res;

          case 400:
            throw new Error(res.statusMessage);

          case 404:
            throw new Error('Not found');

          case 429:
            await sleep(2000);
            throw new Error('Rate limited');

          case 500:
            throw new Error('Internal server error');

          case 504:
            await sleep(5000);
            throw new Error('OpenSea down');

          default:
            await sleep(2000);
            throw new Error(`Unknown status code: ${res.statusCode}`);
        }
      } catch (err) {
        const handlerRes = gotErrorHandler(err);
        if ('retry' in handlerRes) {
          await sleep(handlerRes.delay);
        } else if (!handlerRes.fatal) {
          // unknown error
          if (attempt >= maxAttempts) {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  }
}
