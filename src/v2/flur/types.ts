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
}

export interface TwitterRequirementConnected {
  step: TwitterRequirementStep.Connected;
  linkParams: LinkParams;
  redirectParams: RedirectParams;
  user: unknown;
}

export type TwitterRequirement =
  | TwitterRequirementInitial
  | TwitterRequirementGeneratedLink
  | TwitterRequirementConnected;

enum TweetRequirementStep {
  Initial,
  WaitingVerification,
  Verified
}

export interface TweetRequirementInitial {
  step: TweetRequirementStep.Initial;
}

export interface TweetRequirementWaitingVerification {
  step: TweetRequirementStep.WaitingVerification;
  tweetId: string;
  userId: string;
}

export interface TweetRequirementVerified {
  step: TweetRequirementStep.Verified;
  tweetId: string;
  userId: string;
}

export interface AirdropRequirementsData {
  twitterConnect: TwitterRequirement;

  tweet: TweetRequirementInitial;

  discord: unknown;
}

export enum AirdropRequirementStep {
  ConnectTwitter,
  Tweet,
  ConnectDiscord,
  Claim
}

export interface AirdropRequirementConnectTwitter {
  step: AirdropRequirementStep.ConnectTwitter;
  data: {
    url: string;
  };
}

export interface AirdropRequirementTweet {
  step: AirdropRequirementStep.Tweet;
  data: {
    text: string;
  };
}

export interface AirdropRequirementConnectDiscord {
  step: AirdropRequirementStep.ConnectDiscord;
  data: unknown;
}

export interface AirdropRequirementClaim {
  step: AirdropRequirementStep.Claim;
  data: unknown;
}

export type AirdropRequirement =
  | AirdropRequirementConnectTwitter
  | AirdropRequirementTweet
  | AirdropRequirementConnectDiscord
  | AirdropRequirementClaim;
