import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user';

export interface ApiUserStorage {
  getUser(userId: string): Promise<ApiUserDto | undefined>;

  setUser(user: ApiUserDto): Promise<void>;
}
