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
  DiscordRequirementConnected,
  DiscordRequirementStep,
  DiscordTokenResponse,
  DiscordUserResponse,
  LinkParams,
  Twitter,
  TwitterFollowerStep,
  TwitterRequirementStep
} from './types';
import { join, normalize } from 'path';
import { ONE_MIN } from '@infinityxyz/lib/utils/constants';
import got from 'got/dist/source';

@Injectable()
export class BetaService {
  protected _twitterClient: TwitterApi;
  protected _twitterCallbackUrl: string;
  protected _discordCallbackUrl: string;
  protected _discordClientId: string;
  protected _discordClientSecret: string;
  protected _discordGuildId: string;

  constructor(protected _firebase: FirebaseService, protected _configService: ConfigService<EnvironmentVariables>) {
    const clientId = this._configService.get('TWITTER_CLIENT_ID');
    const clientSecret = this._configService.get('TWITTER_CLIENT_SECRET');
    this._twitterClient = new TwitterApi({ clientId, clientSecret });
    const apiBase = this._configService.get('FRONTEND_HOST');
    this._discordCallbackUrl = new URL(normalize(join(apiBase, `/callback/discord`))).toString();
    this._twitterCallbackUrl = new URL(normalize(join(apiBase, `/callback/twitter`))).toString();
    this._discordClientId = this._configService.get('DISCORD_CLIENT_ID') ?? '';
    this._discordClientSecret = this._configService.get('DISCORD_CLIENT_SECRET') ?? '';
    this._discordGuildId = this._configService.get('DISCORD_GUILD_ID') ?? '';
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
              const { isFollowing, userAuth } = await this.isFollowingFlow(
                {
                  accessToken: data.twitterConnect.redirectParams.accessToken,
                  refreshToken: data.twitterConnect.redirectParams.refreshToken,
                  expiresAt: data.twitterConnect.redirectParams.expiresAt
                },
                data.twitterConnect.user.id
              );

              data.twitterConnect.redirectParams.accessToken = userAuth.accessToken;
              data.twitterConnect.redirectParams.refreshToken = userAuth.refreshToken;
              data.twitterConnect.redirectParams.expiresAt = userAuth.expiresAt;

              if (isFollowing) {
                twitter = {
                  step: Twitter.Complete
                };
                data.twitterFollower = {
                  step: TwitterFollowerStep.Follower
                };
              } else {
                twitter = {
                  step: Twitter.Follow,
                  data: {
                    url: 'https://twitter.com/flowdotso'
                  }
                };
              }
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
            data: {
              url: `https://discord.com/api/oauth2/authorize?client_id=${this._discordClientId}&redirect_uri=${this._discordCallbackUrl}&response_type=code&scope=identify%20guilds`
            }
          };
          break;
        }
        case DiscordRequirementStep.Connected: {
          // TODO check if user is in the server
          const { isMember, userAuth } = await this.isInFlowDiscord(data.discord.auth, data.discord.user.id);
          data.discord.auth = userAuth;
          if (isMember) {
            data.discord = {
              step: DiscordRequirementStep.Member,
              auth: data.discord.auth,
              user: data.discord.user
            };
            discord = {
              step: Discord.Complete
            };
          } else {
            discord = {
              step: Discord.Join,
              data: {
                url: 'https://discord.gg/SX4BBa9u' // TODO get another invite link
              }
            };
          }
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
    const { url, codeVerifier, state } = this._twitterClient.generateOAuth2AuthLink(this._twitterCallbackUrl, {
      scope: ['tweet.read', 'users.read', 'follows.read', 'offline.access']
    });

    return {
      callbackUrl: this._twitterCallbackUrl,
      url,
      codeVerifier,
      state
    };
  }

  public async isInFlowDiscord(
    userAuth: DiscordRequirementConnected['auth'],
    userId: string
  ): Promise<{ isMember: boolean; userAuth: DiscordRequirementConnected['auth'] }> {
    try {
      userAuth = await this.refreshDiscordToken(userAuth);

      const response = await got('https://discord.com/api/users/@me/guilds', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userAuth.accessToken}`,
          'Content-Type': 'application/json'
        },
        responseType: 'json'
      });

      if (response.statusCode === 200) {
        const isMember = ((response.body ?? []) as { id: string }[]).some(
          (guild: { id: string }) => guild?.id === this._discordGuildId
        );
        return { isMember, userAuth: userAuth };
      } else {
        console.error(
          `Failed to retrieve discord guilds for user ${userId} Status code ${response.statusCode}`,
          response.body
        );
        return { isMember: false, userAuth: userAuth };
      }
    } catch (err) {
      console.error(`Failed to retrieve discord guilds for user ${userId}`, err);
      return { isMember: false, userAuth: userAuth };
    }
  }

  public async refreshDiscordToken(
    userAuth: DiscordRequirementConnected['auth']
  ): Promise<DiscordRequirementConnected['auth']> {
    const params = {
      client_id: this._discordClientId,
      client_secret: this._discordClientSecret,
      grant_type: 'refresh_token',
      refresh_token: userAuth.refreshToken,
      scope: 'identify guilds'
    };

    if (userAuth.expiresAt < Date.now() - ONE_MIN * 2) {
      const response = await got<DiscordTokenResponse>('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams(params).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        throwHttpErrors: false,
        responseType: 'json'
      });

      if (response.statusCode === 200) {
        const { access_token, refresh_token, expires_in } = response.body;
        const expiresAt = Date.now() + expires_in * 1000;
        console.log(`Refreshed discord token for user Expires at ${expiresAt} `);

        return {
          ...userAuth,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt
        };
      } else {
        throw new Error(`Failed to refresh discord token Status code ${response.statusCode}`);
      }
    }

    return userAuth;
  }

  public async isFollowingFlow(
    userAuth: { accessToken: string; refreshToken: string; expiresAt: number },
    userId: string
  ) {
    let updatedAuth = { ...userAuth };
    let client = new TwitterApi(userAuth.accessToken);
    if (Date.now() > userAuth.expiresAt - ONE_MIN * 2) {
      console.log(
        `Refreshing access token for user ${userId} Expired at ${userAuth.expiresAt} Current time ${Date.now()} `
      );
      const {
        client: refreshedClient,
        accessToken,
        refreshToken,
        expiresIn
      } = await this._twitterClient.refreshOAuth2Token(userAuth.refreshToken);
      const expiresAt = Date.now() + expiresIn * 1000;
      if (!refreshToken) {
        console.log(`No refresh token returned for user ${userId}`);
        throw new Error('No refresh token returned');
      }
      updatedAuth = {
        accessToken,
        refreshToken,
        expiresAt
      };
      client = refreshedClient;
    }

    const flowId = '1444756392531922946';
    try {
      console.log(`Checking if user ${userId} is following flow ${flowId}`);
      const pageSize = 1000;
      const followings = await client.v2.following(userId, { asPaginator: true, max_results: pageSize });
      let page = followings.data.data ?? [];
      let pageNum = 0;
      // eslint-disable-next-line no-constant-condition
      while (pageNum < 10) {
        pageNum += 1;
        const isFollowingFlow = page.some((item) => item.id === flowId);
        console.log(`Page length: ${page.length} isFollowingFlow: ${isFollowingFlow}`);
        console.log(`First item in page: ${page[0]?.id}`);
        if (isFollowingFlow) {
          return { isFollowing: true, userAuth: updatedAuth };
        } else if (page.length < pageSize) {
          return { isFollowing: false, userAuth: updatedAuth };
        }

        page = (await followings.next(pageSize)).data.data ?? [];
      }
    } catch (err) {
      console.error(`Failed to check if user is following flow`, err);
    }
    return { isFollowing: false, userAuth: updatedAuth };
  }

  async handleDiscordOAuthCallback(data: { code: string }, user: ParsedUserId): Promise<{ success: boolean }> {
    const betaRequirementsRef = user.ref
      .collection('flowBeta')
      .doc('flowBetaAuthorization') as DocRef<BetaRequirementsData>;

    if (!data.code) {
      throw new Error(`User denied app or session expired`);
    }

    try {
      const result = await this._firebase.firestore.runTransaction(async (txn) => {
        const betaRequirementsSnap = await txn.get(betaRequirementsRef);
        const betaRequirements = betaRequirementsSnap.data();
        if (!betaRequirements) {
          throw new Error(`User ${user.userAddress} initiated the beta authorization flow`);
        } else if (betaRequirements?.discord?.step === DiscordRequirementStep.Connected) {
          return { success: true };
        } else if (betaRequirements?.discord?.step === DiscordRequirementStep.Member) {
          return { success: true };
        }

        const params = {
          client_id: this._configService.get('DISCORD_CLIENT_ID'),
          client_secret: this._configService.get('DISCORD_CLIENT_SECRET'),
          grant_type: 'authorization_code',
          code: data.code,
          redirect_uri: this._discordCallbackUrl,
          scope: 'identify guilds'
        };

        console.log(`Requesting access token for user ${user.userAddress}`);
        const response = await got<DiscordTokenResponse>('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams(params).toString(),
          headers: {
            'Content-type': 'application/x-www-form-urlencoded'
          },
          responseType: 'json',
          throwHttpErrors: false
        });

        if (response.statusCode === 200) {
          const auth: DiscordRequirementConnected['auth'] = {
            accessToken: response.body.access_token,
            refreshToken: response.body.refresh_token,
            expiresAt: Date.now() + response.body.expires_in * 1000,
            scope: response.body.scope,
            tokenType: response.body.token_type
          };

          console.log(`Successfully requested discord access token for user ${user.userAddress}`);
          console.log(`Requesting discord user info for user ${user.userAddress}`);

          const userResponse = await got<DiscordUserResponse>('https://discord.com/api/users/@me', {
            headers: {
              authorization: `${auth.tokenType} ${auth.accessToken}`
            },
            responseType: 'json',
            throwHttpErrors: false
          });

          if (userResponse.statusCode === 200 && userResponse.body.id) {
            console.log(`Successfully requested discord user info for user ${user.userAddress}`);
            betaRequirements.discord = {
              step: DiscordRequirementStep.Connected,
              user: {
                id: userResponse.body.id,
                username: userResponse.body.username,
                discriminator: userResponse.body.discriminator,
                locale: userResponse.body.locale,
                mfaEnabled: userResponse.body.mfa_enabled,
                premiumType: userResponse.body.premium_type
              },
              auth
            };
            txn.set(betaRequirementsRef, betaRequirements, { merge: true });
            return { success: true };
          }
          console.log(
            `Failed to request discord user info for user ${user.userAddress} Response code ${userResponse.statusCode}`,
            userResponse.body
          );
          return {
            success: false
          };
        }
        console.log(
          `Failed to request access token for user ${user.userAddress} Response code ${response.statusCode}`,
          response.body
        );
        return { success: true };
      });

      return result;
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      return { success: false };
    }
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
