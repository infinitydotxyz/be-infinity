import { ApiUser } from './api-user.types';

export interface ApiUserStorage {
  getUser(userId: string): Promise<ApiUser | undefined>;

  setUser(user: ApiUser): Promise<void>;
}
