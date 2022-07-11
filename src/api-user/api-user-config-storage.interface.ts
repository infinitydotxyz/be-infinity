import { ApiUserConfig } from './api-user.types';

export interface ApiUserConfigStorage {
  getUser(userId: string): Promise<ApiUserConfig | undefined>;

  setUser(userId: string, config: ApiUserConfig): Promise<void>;
}
