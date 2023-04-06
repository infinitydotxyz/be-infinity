import { UserV2 } from 'twitter-api-v2';

export enum TwitterRequirementStep {
  Initial,
  GeneratedLink,
  Connected
}

export interface TwitterRequirementInitial {
  step: TwitterRequirementStep.Initial;
}

export interface LinkParams {
  codeVerifier: string;
  state: string;
  callbackUrl: string;
  url: string;
}

export interface TwitterRequirementGeneratedLink {
  step: TwitterRequirementStep.GeneratedLink;
  linkParams: LinkParams;
}

export interface RedirectParams {
  state: string;
  code: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

export interface TwitterRequirementConnected {
  step: TwitterRequirementStep.Connected;
  linkParams: LinkParams;
  redirectParams: RedirectParams;
  user: UserV2;
}

export type TwitterRequirement =
  | TwitterRequirementInitial
  | TwitterRequirementGeneratedLink
  | TwitterRequirementConnected;

export enum TwitterFollowerStep {
  Initial,
  Follower
}

export interface TwitterFollowerRequirementInitial {
  step: TwitterFollowerStep.Initial;
}

export interface TwitterFollowerRequirementFollower {
  step: TwitterFollowerStep.Follower;
}

export type TwitterFollowerRequirement = TwitterFollowerRequirementInitial | TwitterFollowerRequirementFollower;

export enum DiscordRequirementStep {
  Initial,
  Connected,
  Member
}
export interface DiscordRequirementInitial {
  step: DiscordRequirementStep.Initial;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  locale: string;
  mfaEnabled: boolean;
  premiumType: number;
}

export interface DiscordRequirementConnected {
  step: DiscordRequirementStep.Connected;
  auth: {
    accessToken: string;
    expiresAt: number;
    refreshToken: string;
    scope: string;
    tokenType: 'Bearer';
  };
  user: DiscordUser;
}

export interface DiscordRequirementMember {
  step: DiscordRequirementStep.Member;
  auth: {
    accessToken: string;
    expiresAt: number;
    refreshToken: string;
    scope: string;
    tokenType: 'Bearer';
  };
  user: DiscordUser;
}

export type DiscordRequirement = DiscordRequirementInitial | DiscordRequirementConnected | DiscordRequirementMember;

export interface BetaRequirementsData {
  metadata: {
    user: string;
    timing: {
      updatedAt: number;
      createdAt: number;
      authorizedAt: number | null;
    };
  };

  twitterConnect: TwitterRequirement;

  twitterFollower: TwitterFollowerRequirement;

  discord: DiscordRequirement;
}

export enum Twitter {
  Connect,
  Follow,
  Complete
}

export interface ConnectTwitter {
  step: Twitter.Connect;
  data: {
    url: string;
  };
}

export interface FollowOnTwitter {
  step: Twitter.Follow;
  data: {
    url: string;
  };
}

export interface CompletedTwitter {
  step: Twitter.Complete;
}

export enum Discord {
  Connect,
  Join,
  Complete
}
export interface ConnectDiscord {
  step: Discord.Connect;
  data: {
    url: string;
  };
}

export interface JoinDiscord {
  step: Discord.Join;
  data: {
    url: string;
  };
}

export interface CompletedDiscord {
  step: Discord.Complete;
}

export enum BetaAuthorizationStatus {
  UnAuthorized,
  Authorized
}

export interface BetaAuthorizationIncomplete {
  status: BetaAuthorizationStatus;
  twitter: ConnectTwitter | FollowOnTwitter | CompletedTwitter;
  discord: ConnectDiscord | JoinDiscord | CompletedDiscord;
}

export interface BetaAuthorizationComplete {
  status: BetaAuthorizationStatus.Authorized;
}

export type BetaAuthorization = BetaAuthorizationIncomplete | BetaAuthorizationComplete;

export interface DiscordTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: 'Bearer';
}

export interface DiscordUserResponse {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  public_flags: number;
  flags: number;
  banner: string;
  locale: string;
  mfa_enabled: boolean;
  premium_type: number;
}