import { ApiUserDto } from '@infinityxyz/lib/types/dto/api-user/api-user.dto';
import { validateAndStrip } from 'utils/strip-properties';

export abstract class ApiUserStorage implements ApiUserStorage {
  protected abstract _getUser(userId: string): Promise<ApiUserDto | null>;

  protected abstract _setUser(user: ApiUserDto): Promise<ApiUserDto>;

  async getUser(userId: string): Promise<ApiUserDto | null> {
    return await this._getUser(userId);
  }

  async setUser(user: ApiUserDto): Promise<ApiUserDto> {
    try {
      const { result, errors } = await validateAndStrip(ApiUserDto, user);
      if (errors.length > 0) {
        throw new Error(`Invalid user: ${JSON.stringify(errors)}`);
      }
      const updated = await this._setUser(result);
      return updated;
    } catch (err) {
      console.error(`Failed to update api user: ${user.id}`, err);
      throw err;
    }
  }
}
