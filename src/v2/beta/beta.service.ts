import { Injectable } from '@nestjs/common';
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

@Injectable()
export class BetaService {
  protected _twitterClient: TwitterApi;
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
          const linkParams = this.getTwitterOAuthLink();
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
                  url: 'https://twitter.com/flowdotso'
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

      txn.set(betaRequirementsRef, data, { merge: true });
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

  getTwitterOAuthLink(): LinkParams {
    const apiBase = this._configService.get('FRONTEND_HOST');
    const callbackUrl = new URL(normalize(join(apiBase, `/callback`))).toString();

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

  public async handleTwitterOAuthCallback(
    data: { state: string; code: string },
    user: ParsedUserId
  ): Promise<{ success: boolean }> {
    const betaRequirementsRef = user.ref
      .collection('flowBeta')
      .doc('flowBetaAuthorization') as DocRef<BetaRequirementsData>;

    if (!data.state || !data.code) {
      throw new Error(`User denied app or session expired`);
    }

    try {
      const result = await this._firebase.firestore.runTransaction(async (txn) => {
        const betaRequirementsSnap = await txn.get(betaRequirementsRef);
        const betaRequirements = betaRequirementsSnap.data();

        if (betaRequirements?.twitterConnect.step === TwitterRequirementStep.Connected) {
          return { success: true };
        }

        if (!betaRequirements) {
          throw new Error(`Failed to find code verifier for user ${user.userAddress}`);
        } else if (betaRequirements.twitterConnect.step === TwitterRequirementStep.Initial) {
          throw new Error(`Failed to find code verifier for user ${user.userAddress}`);
        }

        const { codeVerifier, state } = betaRequirements.twitterConnect.linkParams;
        if (!codeVerifier || !state) {
          throw new Error(`Failed to find code verifier for user ${user.userAddress}`);
        } else if (state !== data.state) {
          throw new Error(`Invalid state for user ${user.userAddress}`);
        }

        console.log(`Logging in user ${user.userAddress}`);
        const {
          client: loggedInClient,
          accessToken,
          refreshToken,
          expiresIn
        } = await this._twitterClient.loginWithOAuth2({
          code: data.code,
          codeVerifier,
          redirectUri: betaRequirements.twitterConnect.linkParams.callbackUrl
        });
        console.log(`Logged in user ${user.userAddress}`);

        if (!refreshToken) {
          throw new Error(`Failed to get refresh token for user ${user.userAddress}`);
        }

        const { data: userObject } = await loggedInClient.currentUserV2();
        console.log(`Retrieved twitter account for user ${user.userAddress}`);

        if (!userObject.id) {
          throw new Error(`Failed to get user id for user ${user.userAddress}`);
        }

        const expiresAt = Date.now() + expiresIn * 1000;
        betaRequirements.twitterConnect = {
          step: TwitterRequirementStep.Connected,
          linkParams: betaRequirements.twitterConnect.linkParams,
          redirectParams: {
            state: data.state,
            code: data.code,
            accessToken,
            refreshToken,
            expiresIn,
            expiresAt
          },
          user: userObject
        };

        txn.set(betaRequirementsRef, betaRequirements, { merge: true });

        return { success: true };
      });

      return result;
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      return { success: false };
    }
  }
}
