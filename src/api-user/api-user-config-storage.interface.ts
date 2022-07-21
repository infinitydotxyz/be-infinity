import { ApiUserDto } from './dto/api-user.dto';

export interface ApiUserStorage {
  getUser(userId: string): Promise<ApiUserDto | undefined>;

  setUser(user: ApiUserDto): Promise<void>;
}
