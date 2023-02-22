import { Injectable } from '@nestjs/common';
import TwitterApi from 'twitter-api-v2';
import { ParsedUserId } from 'user/parser/parsed-user-id';
import { FirebaseService } from 'firebase/firebase.service';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import { DocRef } from 'types/firestore';
import { AirdropRequirement, AirdropRequirements, AirdropRequirementsData, TwitterRequirementStep } from './types';

@Injectable()
export class FlurService {
  protected _twitterClient: TwitterApi;
  constructor(protected _firebase: FirebaseService, protected _configService: ConfigService<EnvironmentVariables>) {
    const clientId = this._configService.get('TWITTER_CLIENT_ID');
    const clientSecret = this._configService.get('TWITTER_CLIENT_SECRET');
    this._twitterClient = new TwitterApi({ clientId, clientSecret });
  }

  async getAirdropRequirements(user: ParsedUserId): Promise<AirdropRequirement> {
    const airdropRequirements = user.ref
      .collection('flurUserData')
      .doc('airdropRequirements') as DocRef<AirdropRequirementsData>;

    const result = await this._firebase.firestore.runTransaction(async (txn) => {
      const snap = await txn.get(airdropRequirements);
      const data = snap.data() ?? {
        twitterConnect: {
          step: TwitterRequirementStep.Initial
        },
        tweet: {
          step: TwitterRequirementStep.Initial
        },
        discord: {}
      };

      switch (data.twitterConnect.step) {
        case TwitterRequirementStep.Initial:
          let update;
      }
      //   if (data.twitterConnect.step === TwitterRequirementStep.Connected) {
      //     return {
      //       success: false,
      //       message: 'Already connected'
      //     };
      //   }

      //   data.twitterConnect = {
      //     step: TwitterRequirementStep.GeneratedLink,
      //     linkParams: {
      //       codeVerifier,
      //       state,
      //       callbackUrl,
      //       url
      //     }
      //   };

      txn.set(airdropRequirements, data);
      return { success: true, url };
    });
  }

  async getOAuthLink(callbackUrl: string, user: ParsedUserId) {
    const { url, codeVerifier, state } = this._twitterClient.generateOAuth2AuthLink(callbackUrl, {
      scope: ['tweet.read', 'users.read', 'offline.access']
    });

    const airdropRequirements = user.ref
      .collection('flurUserData')
      .doc('airdropRequirements') as DocRef<AirdropRequirementsData>;

    const result = await this._firebase.firestore.runTransaction(async (txn) => {
      const snap = await txn.get(airdropRequirements);
      const data = snap.data() ?? {
        twitterConnect: {
          step: TwitterRequirementStep.Initial
        },
        tweet: {},
        discord: {}
      };

      if (data.twitterConnect.step === TwitterRequirementStep.Connected) {
        return {
          success: false,
          message: 'Already connected'
        };
      }

      data.twitterConnect = {
        step: TwitterRequirementStep.GeneratedLink,
        linkParams: {
          codeVerifier,
          state,
          callbackUrl,
          url
        }
      };

      txn.set(airdropRequirements, data);
      return { success: true, url };
    });

    return result;
  }
}
