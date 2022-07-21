import { ApiRole, ApiRoleHierarchy } from 'auth/auth.constants';
import { createHmac } from 'crypto';
import { ApiUserCredsDto } from './dto/api-user.dto';

export function getHmac(creds: ApiUserCredsDto) {
  return createHmac('sha256', creds.apiSecret.toLowerCase())
    .update(creds.apiKey.toLowerCase())
    .digest('hex')
    .toLowerCase();
}

export function hasApiRole(userRole: ApiRole, minimumRole: ApiRole) {
  return ApiRoleHierarchy[userRole] >= ApiRoleHierarchy[minimumRole];
}
