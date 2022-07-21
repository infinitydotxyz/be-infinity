import { ApiUserDto } from './dto/api-user.dto';

export type ApiUserKeys = keyof ApiUserDto;

export interface ApiUserVerifier {
  verifyAndGetUserConfig(
    apiKey: string,
    apiSecret: string
  ): Promise<{ isValid: true; user: ApiUserDto } | { isValid: false; reason: string }>;
}
