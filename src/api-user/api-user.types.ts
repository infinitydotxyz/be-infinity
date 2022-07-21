import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user/api-user.dto';

export type ApiUserKeys = keyof ApiUserDto;

export interface ApiUserVerifier {
  verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; user: ApiUserDto } | { isValid: false; reason: string }>;
}
