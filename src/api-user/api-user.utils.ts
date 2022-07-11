import { createHmac } from 'crypto';
import { ApiUserCreds } from './api-user.types';

export function getHmac(creds: ApiUserCreds) {
  return createHmac('sha256', creds.apiSecret).update(creds.apiKey).digest('hex');
}
