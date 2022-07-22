import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user';

export interface ApiUserStorage {
  getUser(userId: string): Promise<ApiUserDto | null>;

  setUser(user: ApiUserDto): Promise<void>;
}
