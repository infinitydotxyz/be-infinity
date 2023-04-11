import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from 'firebase/firebase.service';
import TwitterApi from 'twitter-api-v2';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { CollRef, DocRef } from 'types/firestore';
import { ParsedUserId } from 'user/parser/parsed-user-id';

import {
  BetaAuthorization,
  BetaAuthorizationIncomplete,
  BetaAuthorizationStatus,
  BetaRequirementsData,
  CompletedReferralStatus,
  Discord,
  DiscordRequirementConnected,
  DiscordRequirementStep,
  DiscordTokenResponse,
  DiscordUserResponse,
  LinkParams,
  Referral,
  ReferralCode,
  ReferralRequirementReferred,
  ReferralRequirementStep,
  ReferralRewards,
  ReferralStep,
  ReferredReferralStatus,
  Twitter,
  TwitterFollowerStep,
  TwitterRequirementConnected,
  TwitterRequirementStep
} from './types';
import { join, normalize } from 'path';
import { ONE_MIN } from '@infinityxyz/lib/utils/constants';
import got from 'got/dist/source';
import { customAlphabet } from 'nanoid';

@Injectable()
export class BetaService {
  protected _twitterClient: TwitterApi;
  protected _twitterCallbackUrl: string;
  protected _twitterBetaAuthAccountId: string;
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
    this._twitterBetaAuthAccountId = this._configService.get('TWITTER_BETA_AUTH_ACCOUNT_ID') ?? '';
  }

  get flowBetaAuthColl() {
    return this._firebase.firestore.collection('flowBetaAuth') as CollRef<BetaRequirementsData>;
  }

  get flowBetaReferralCodesColl() {
    return this._firebase.firestore.collection('flowBetaReferralCodes') as CollRef<ReferralCode>;
  }

  getDefaultBetaRequirements(user: ParsedUserId): BetaRequirementsData {
    const now = Date.now();
    return {
      metadata: {
        user: user.userAddress,
        timing: {
          updatedAt: now,
          createdAt: now,
          authorizedAt: null
        }
      },
      referral: {
        step: ReferralRequirementStep.Initial
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

  protected transformReferralBetaRequirementsToAuth(
    user: ParsedUserId,
    data: BetaRequirementsData['referral'],
    isTwitterComplete: boolean,
    isDiscordComplete: boolean
  ): {
    auth: BetaAuthorizationIncomplete['referral'];
    isAuthorized: boolean;
    referralRequirement: BetaRequirementsData['referral'];
    referral?: Referral;
    save?: (txn: FirebaseFirestore.Transaction) => void;
  } {
    switch (data.step) {
      case ReferralRequirementStep.Initial: {
        return {
          auth: {
            step: ReferralStep.Incomplete
          },
          referralRequirement: data,
          isAuthorized: false
        };
      }
      case ReferralRequirementStep.Referred: {
        const isAuthorized = isTwitterComplete && isDiscordComplete;

        if (isAuthorized) {
          const now = Date.now();
          const referralEvent: Referral = {
            ...data.referral,
            processed: false
          };

          const referralCode: ReferralCode = {
            referralCode: this.generateReferralCode(),
            createdAt: now,
            owner: {
              address: user.userAddress
            },
            isValid: true
          };

          const refereeReferralCodeRef = this.flowBetaReferralCodesColl.doc(
            referralCode.referralCode
          ) as DocRef<ReferralCode>;
          const refererReferralEventRef = this.flowBetaReferralCodesColl
            .doc(data.referral.referer.code)
            .collection('flowBetaUserReferrals')
            .doc(data.referral.referee.address) as DocRef<Referral>;

          const save = (txn: FirebaseFirestore.Transaction) => {
            // saves who referred the user
            txn.create(refererReferralEventRef, referralEvent);
            // ensures there aren't duplicate referral codes
            txn.create(refereeReferralCodeRef, referralCode);
          };
          return {
            auth: {
              step: ReferralStep.Complete,
              referralCode: referralCode.referralCode
            },
            isAuthorized: true,
            referralRequirement: data,
            save
          };
        }
        return {
          auth: {
            step: ReferralStep.Referred
          },
          isAuthorized: false,
          referralRequirement: data
        };
      }
      case ReferralRequirementStep.Complete: {
        if (!isTwitterComplete || !isDiscordComplete) {
          throw new Error(`Invariant expected twitter and discord to be complete when referral is complete`);
        }
        return {
          auth: {
            step: ReferralStep.Complete,
            referralCode: data.referralCode
          },
          isAuthorized: true,
          referralRequirement: data
        };
      }
    }
  }

  protected async transformTwitterBetaRequirementsToAuth(
    twitterConnect: BetaRequirementsData['twitterConnect'],
    twitterFollower: BetaRequirementsData['twitterFollower']
  ): Promise<{
    auth: BetaAuthorizationIncomplete['twitter'];
    twitterConnectRequirement: BetaRequirementsData['twitterConnect'];
    twitterFollowerRequirement: BetaRequirementsData['twitterFollower'];
  }> {
    switch (twitterConnect.step) {
      case TwitterRequirementStep.Initial: {
        const linkParams = this.getTwitterOAuthLink();
        twitterConnect = {
          step: TwitterRequirementStep.GeneratedLink,
          linkParams: linkParams
        };

        return {
          twitterConnectRequirement: twitterConnect,
          twitterFollowerRequirement: twitterFollower,
          auth: {
            step: Twitter.Connect,
            data: {
              url: linkParams.url
            }
          }
        };
      }
      case TwitterRequirementStep.GeneratedLink: {
        return {
          twitterConnectRequirement: twitterConnect,
          twitterFollowerRequirement: twitterFollower,
          auth: {
            step: Twitter.Connect,
            data: {
              url: twitterConnect.linkParams.url
            }
          }
        };
      }

      case TwitterRequirementStep.Connected: {
        switch (twitterFollower.step) {
          case TwitterFollowerStep.Initial: {
            const { isFollowing, userAuth } = await this.isFollowingFlow(
              {
                accessToken: twitterConnect.redirectParams.accessToken,
                refreshToken: twitterConnect.redirectParams.refreshToken,
                expiresAt: twitterConnect.redirectParams.expiresAt
              },
              twitterConnect.user.id
            );

            if (isFollowing) {
              const updatedTwitterConnect = JSON.parse(JSON.stringify(twitterConnect)) as TwitterRequirementConnected;
              updatedTwitterConnect.redirectParams.accessToken = userAuth.accessToken;
              updatedTwitterConnect.redirectParams.refreshToken = userAuth.refreshToken;
              updatedTwitterConnect.redirectParams.expiresAt = userAuth.expiresAt;
              return {
                twitterConnectRequirement: updatedTwitterConnect,
                twitterFollowerRequirement: {
                  step: TwitterFollowerStep.Follower
                },
                auth: {
                  step: Twitter.Complete
                }
              };
            }
            return {
              twitterConnectRequirement: twitterConnect,
              twitterFollowerRequirement: twitterFollower,
              auth: {
                step: Twitter.Follow,
                data: {
                  url: 'https://twitter.com/flowdotso'
                }
              }
            };
          }
          case TwitterFollowerStep.Follower: {
            return {
              twitterConnectRequirement: twitterConnect,
              twitterFollowerRequirement: twitterFollower,
              auth: {
                step: Twitter.Complete
              }
            };
          }
        }
      }
    }
  }

  protected async transformDiscordBetaRequirementsToAuth(
    data: BetaRequirementsData['discord']
  ): Promise<{ auth: BetaAuthorizationIncomplete['discord']; discordRequirements: BetaRequirementsData['discord'] }> {
    switch (data.step) {
      case DiscordRequirementStep.Initial: {
        return {
          discordRequirements: data,
          auth: {
            step: Discord.Connect,
            data: {
              url: `https://discord.com/api/oauth2/authorize?client_id=${this._discordClientId}&redirect_uri=${this._discordCallbackUrl}&response_type=code&scope=identify%20guilds`
            }
          }
        };
      }
      case DiscordRequirementStep.Connected: {
        const { isMember, userAuth } = await this.isInFlowDiscord(data.auth, data.user.id);
        if (isMember) {
          return {
            discordRequirements: {
              step: DiscordRequirementStep.Member,
              auth: userAuth,
              user: data.user
            },
            auth: {
              step: Discord.Complete
            }
          };
        }
        return {
          discordRequirements: data,
          auth: {
            step: Discord.Join,
            data: {
              url: 'https://discord.gg/flowdotso'
            }
          }
        };
      }
      case DiscordRequirementStep.Member: {
        return {
          discordRequirements: data,
          auth: {
            step: Discord.Complete
          }
        };
      }
    }
  }

  async getBetaAuthorization(user: ParsedUserId): Promise<BetaAuthorization> {
    const betaRequirementsRef = this.flowBetaAuthColl.doc(user.userAddress);

    const result = await this._firebase.firestore.runTransaction<BetaAuthorization>(async (txn) => {
      const snap = await txn.get(betaRequirementsRef);
      const data = snap.data() ?? this.getDefaultBetaRequirements(user);

      const {
        auth: twitter,
        twitterConnectRequirement,
        twitterFollowerRequirement
      } = await this.transformTwitterBetaRequirementsToAuth(data.twitterConnect, data.twitterFollower);
      const { auth: discord, discordRequirements } = await this.transformDiscordBetaRequirementsToAuth(data.discord);

      const isTwitterComplete = twitter.step === Twitter.Complete;
      const isDiscordComplete = discord.step === Discord.Complete;
      const {
        auth: referral,
        referralRequirement,
        save: saveReferralUpdate
      } = this.transformReferralBetaRequirementsToAuth(user, data.referral, isTwitterComplete, isDiscordComplete);

      if (referral.step === ReferralStep.Complete && !data.metadata.timing.authorizedAt) {
        data.metadata.timing.authorizedAt = Date.now();
      }
      const updatedAuthData: BetaRequirementsData = {
        metadata: {
          ...data.metadata
        },
        twitterConnect: twitterConnectRequirement,
        twitterFollower: twitterFollowerRequirement,
        discord: discordRequirements,
        referral: referralRequirement
      };

      if (typeof saveReferralUpdate === 'function') {
        saveReferralUpdate(txn);
      }
      txn.set(betaRequirementsRef, updatedAuthData, { merge: true });
      if (referral.step === ReferralStep.Complete) {
        return {
          status: BetaAuthorizationStatus.Authorized,
          referralCode: referral.referralCode
        };
      }
      return {
        status: BetaAuthorizationStatus.UnAuthorized,
        twitter,
        discord,
        referral
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

  async referUser(
    user: ParsedUserId,
    referralCode: string
  ): Promise<
    | { success: false; message: string }
    | { success: true; referralStatus: ReferredReferralStatus | CompletedReferralStatus }
  > {
    const referralCodeRef = this.flowBetaReferralCodesColl.doc(referralCode);

    const betaRequirementsRef = this.flowBetaAuthColl.doc(user.userAddress);

    try {
      const referralSnap = await referralCodeRef.get();
      const referralDocData = referralSnap.data();

      if (!referralDocData) {
        return {
          success: false,
          message: 'Invalid referral code'
        };
      } else if (!referralDocData.isValid) {
        return {
          success: false,
          message: 'Invalid referral code'
        };
      }

      const { referralStatus } = await this._firebase.firestore.runTransaction<{
        referralStatus: ReferredReferralStatus | CompletedReferralStatus;
      }>(async (txn) => {
        const snap = await txn.get(betaRequirementsRef);
        const data = snap.data() ?? this.getDefaultBetaRequirements(user);

        switch (data.referral.step) {
          case ReferralRequirementStep.Initial: {
            const referral: ReferredReferralStatus = {
              step: ReferralStep.Referred
            };

            const betaReferral: ReferralRequirementReferred = {
              step: ReferralRequirementStep.Referred,
              referral: {
                referee: {
                  address: user.userAddress
                },
                referer: {
                  address: referralDocData.owner.address,
                  code: referralCode
                },
                createdAt: Date.now()
              }
            };

            txn.set(
              betaRequirementsRef,
              {
                ...data,
                referral: betaReferral
              },
              { merge: true }
            );
            return {
              referralStatus: referral
            };
          }
          case ReferralRequirementStep.Referred: {
            return {
              referralStatus: {
                step: ReferralStep.Referred
              }
            };
          }
          case ReferralRequirementStep.Complete: {
            return {
              referralStatus: {
                step: ReferralStep.Complete,
                referralCode: data.referral.referralCode
              }
            };
          }
        }
      });
      return {
        success: true,
        referralStatus
      };
    } catch (err) {
      console.error(`Error while trying to refer user ${user.userAddress} with referral code ${referralCode}`, err);
      return {
        success: false,
        message: 'Failed to save referral'
      };
    }
  }

  protected generateReferralCode() {
    const generate = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 4);

    const id = [generate(), generate(), generate(), generate()].join('-');
    return id;
  }

  async isInFlowDiscord(
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

    try {
      console.log(`Checking if user ${userId} is following flow ${this._twitterBetaAuthAccountId}`);
      const pageSize = 1000;
      const followings = await client.v2.following(userId, { asPaginator: true, max_results: pageSize });
      let page = followings.data.data ?? [];
      let pageNum = 0;
      // eslint-disable-next-line no-constant-condition
      while (pageNum < 10) {
        pageNum += 1;
        const isFollowingFlow = page.some((item) => item.id === this._twitterBetaAuthAccountId);
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

  async handleDiscordOAuthCallback(
    data: { code: string },
    user: ParsedUserId
  ): Promise<{ success: true } | { success: false; message: string }> {
    const betaRequirementsRef = this.flowBetaAuthColl.doc(user.userAddress);

    if (!data.code) {
      return {
        success: false,
        message: 'User denied app or session expired'
      };
    }

    try {
      const params = {
        client_id: this._configService.get('DISCORD_CLIENT_ID'),
        client_secret: this._configService.get('DISCORD_CLIENT_SECRET'),
        grant_type: 'authorization_code',
        code: data.code,
        redirect_uri: this._discordCallbackUrl,
        scope: 'identify guilds'
      };

      console.log(`Requesting access token for user ${user.userAddress} Code ${data.code}`);
      const response = await got<DiscordTokenResponse>('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams(params).toString(),
        headers: {
          'Content-type': 'application/x-www-form-urlencoded'
        },
        responseType: 'json',
        throwHttpErrors: false
      });

      if (response.statusCode !== 200) {
        console.log(`Failed to request discord access token for user ${user.userAddress}`, response.body);
        return { success: false, message: 'Failed to connect to discord, please try again' };
      }
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

      if (userResponse.statusCode !== 200 || !userResponse.body.id) {
        console.log(
          `Failed to request discord user info for user ${user.userAddress} Response code ${userResponse.statusCode}`,
          userResponse.body
        );
        return { success: false, message: 'Failed to connect to discord, please try again' };
      }

      const result = await this._firebase.firestore.runTransaction<
        { success: true } | { success: false; message: string }
      >(async (txn) => {
        const betaRequirementsSnap = await txn.get(betaRequirementsRef);
        const betaRequirements = betaRequirementsSnap.data();
        if (!betaRequirements) {
          return {
            success: false,
            message: 'Invalid'
          };
        } else if (betaRequirements?.discord?.step === DiscordRequirementStep.Connected) {
          return { success: true };
        } else if (betaRequirements?.discord?.step === DiscordRequirementStep.Member) {
          return { success: true };
        }

        const walletsWithSameDiscordAccountQuery = this.flowBetaAuthColl
          .where('discord.user.id', '==', userResponse.body.id)
          .limit(1);
        const walletsWithSameDiscordAccount = await txn.get(walletsWithSameDiscordAccountQuery);

        if (!walletsWithSameDiscordAccount.empty) {
          return {
            success: false,
            message: `Discord account @${userResponse.body.username} is already connected to another wallet`
          };
        }

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
      });

      return result;
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      return { success: false, message: 'Failed to connect discord, please try again' };
    }
  }

  public async handleTwitterOAuthCallback(
    data: { state: string; code: string },
    user: ParsedUserId
  ): Promise<{ success: true } | { success: false; message: string }> {
    const betaRequirementsRef = this.flowBetaAuthColl.doc(user.userAddress) as DocRef<BetaRequirementsData>;

    if (!data.state || !data.code) {
      return {
        success: false,
        message: 'User denied app or session expired'
      };
    }

    try {
      const betaRequirementsSnap = await betaRequirementsRef.get();
      const betaRequirements = betaRequirementsSnap.data();

      if (betaRequirements?.twitterConnect.step === TwitterRequirementStep.Connected) {
        return { success: true };
      }

      if (!betaRequirements) {
        return {
          success: false,
          message: 'Invalid'
        };
      } else if (betaRequirements.twitterConnect.step === TwitterRequirementStep.Initial) {
        return {
          success: false,
          message: 'Invalid'
        };
      }

      const { codeVerifier, state } = betaRequirements.twitterConnect.linkParams;
      if (!codeVerifier || !state) {
        return {
          success: false,
          message: 'Failed to connect twitter, please try again'
        };
      } else if (state !== data.state) {
        return {
          success: false,
          message: 'Failed to connect twitter, please try again'
        };
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

      const expiresAt = Date.now() + expiresIn * 1000;
      console.log(`Logged in user ${user.userAddress}`);

      if (!refreshToken) {
        return {
          success: false,
          message: 'Failed to connect twitter, please try again'
        };
      }

      const { data: userObject } = await loggedInClient.currentUserV2();

      if (!userObject.id) {
        return {
          success: false,
          message: 'Failed to connect twitter (failed to get user account), please try again'
        };
      }

      console.log(`Retrieved twitter account for user ${user.userAddress}`);

      const result = await this._firebase.firestore.runTransaction<
        { success: true } | { success: false; message: string }
      >(async (txn) => {
        const betaRequirementsSnap = await txn.get(betaRequirementsRef);
        const betaRequirements = betaRequirementsSnap.data();
        const walletsWithSameTwitterAccountQuery = this.flowBetaAuthColl
          .where('twitterConnect.user.id', '==', userObject.id)
          .limit(1);
        const walletsWithSameTwitterAccount = await txn.get(walletsWithSameTwitterAccountQuery);

        if (!walletsWithSameTwitterAccount.empty) {
          return {
            success: false,
            message: `Twitter account @${userObject.username} is already connected to another wallet`
          };
        }

        if (betaRequirements?.twitterConnect.step === TwitterRequirementStep.Connected) {
          return { success: true };
        }

        if (!betaRequirements) {
          return {
            success: false,
            message: 'Invalid'
          };
        } else if (betaRequirements.twitterConnect.step === TwitterRequirementStep.Initial) {
          return {
            success: false,
            message: 'Invalid'
          };
        }

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
      return { success: false, message: 'Failed to connect twitter, please try again' };
    }
  }

  public async getReferralRewards(user: ParsedUserId): Promise<ReferralRewards> {
    const referralRewardsRef = this._firebase.firestore
      .collection('flowBetaReferralRewards')
      .doc(user.userAddress) as DocRef<ReferralRewards>;

    const referralRewardsSnap = await referralRewardsRef.get();

    const referralRewards = referralRewardsSnap.data() ?? {
      numberOfReferrals: 0
    };

    return referralRewards;
  }
}
