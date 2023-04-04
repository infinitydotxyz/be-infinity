import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from 'firebase/firebase.service';
import TwitterApi from 'twitter-api-v2';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { DocRef } from 'types/firestore';
import { ParsedUserId } from 'user/parser/parsed-user-id';

import {
  BetaAuthorization,
  BetaAuthorizationIncomplete,
  BetaAuthorizationStatus,
  BetaRequirementsData,
  Discord,
  DiscordRequirementStep,
  LinkParams,
  Twitter,
  TwitterFollowerStep,
  TwitterRequirementStep
} from './types';
import { join, normalize } from 'path';
import Redis from 'ioredis';

@Injectable()
export class BetaService {
  protected _twitterClient: TwitterApi;

  @Inject('REDIS_CLIENT') private readonly redis: Redis;
  protected _twitterCallbackUrl: string;

  constructor(protected _firebase: FirebaseService, protected _configService: ConfigService<EnvironmentVariables>) {
    const clientId = this._configService.get('TWITTER_CLIENT_ID');
    const clientSecret = this._configService.get('TWITTER_CLIENT_SECRET');
    this._twitterClient = new TwitterApi({ clientId, clientSecret });
  }

  async getBetaAuthorization(user: ParsedUserId): Promise<BetaAuthorization> {
    const betaRequirementsRef = user.ref
      .collection('flowBeta')
      .doc('flowBetaAuthorization') as DocRef<BetaRequirementsData>;

    const result = await this._firebase.firestore.runTransaction<BetaAuthorization>(async (txn) => {
      const snap = await txn.get(betaRequirementsRef);
      let data = snap.data();

      if (!data) {
        const now = Date.now();
        data = {
          metadata: {
            user: user.userAddress,
            timing: {
              updatedAt: now,
              createdAt: now,
              authorizedAt: null
            }
          },
          twitterConnect: {
            step: TwitterRequirementStep.Initial
          },
          twitterFollower: {
            step: TwitterFollowerStep.Initial
          },
          discord: {
            step: DiscordRequirementStep.Initial
          }
        };
      }

      let twitter: BetaAuthorizationIncomplete['twitter'];
      let discord: BetaAuthorizationIncomplete['discord'];

      switch (data.twitterConnect.step) {
        case TwitterRequirementStep.Initial: {
          const linkParams = this.getTwitterOAuthLink(user);
          data.twitterConnect = {
            step: TwitterRequirementStep.GeneratedLink,
            linkParams: linkParams
          };

          twitter = {
            step: Twitter.Connect,
            data: {
              url: linkParams.url
            }
          };
          break;
        }
        case TwitterRequirementStep.GeneratedLink: {
          twitter = {
            step: Twitter.Connect,
            data: {
              url: data.twitterConnect.linkParams.url
            }
          };
          break;
        }

        case TwitterRequirementStep.Connected: {
          switch (data.twitterFollower.step) {
            case TwitterFollowerStep.Initial: {
              twitter = {
                step: Twitter.Follow,
                data: {
                  url: ''
                }
              };
              break;
            }
            case TwitterFollowerStep.Follower: {
              twitter = {
                step: Twitter.Complete
              };
              break;
            }
          }
          if (!twitter) {
            console.error('Invalid user beta flow state', JSON.stringify(data, null, 2));
            throw new Error(`Failed to determine twitter state`);
          }
          break;
        }
      }

      switch (data.discord.step) {
        case DiscordRequirementStep.Initial: {
          discord = {
            step: Discord.Connect,
            data: {}
          };
          break;
        }
        case DiscordRequirementStep.Connected: {
          discord = {
            step: Discord.Join,
            data: {}
          };
          break;
        }
        case DiscordRequirementStep.Member: {
          discord = {
            step: Discord.Complete
          };
          break;
        }
      }

      txn.set(betaRequirementsRef, data);
      if (twitter.step === Twitter.Complete && discord.step === Discord.Complete) {
        return {
          status: BetaAuthorizationStatus.Authorized
        };
      }
      return {
        status: BetaAuthorizationStatus.UnAuthorized,
        twitter,
        discord
      };
    });

    return result;
  }

  getTwitterOAuthLink(user: ParsedUserId): LinkParams {
    const apiBase = this._configService.get('API_BASE');
    const callbackUrl = new URL(normalize(join(apiBase, `/v2/users/${user.userAddress}/beta/auth`))).toString();

    const { url, codeVerifier, state } = this._twitterClient.generateOAuth2AuthLink(callbackUrl, {
      scope: ['tweet.read', 'users.read', 'offline.access']
    });

    return {
      callbackUrl,
      url,
      codeVerifier,
      state
    };
  }

  public handleTwitterOAuthCallback(data: unknown) {
    console.log(JSON.stringify(data, null, 2));
    // this._twitterClient.
  }
}
