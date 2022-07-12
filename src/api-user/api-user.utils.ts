import { createHmac } from 'crypto';
import { ApiUserCreds } from './api-user.types';

export function getHmac(creds: ApiUserCreds) {
  return createHmac('sha256', creds.apiSecret.toLowerCase())
    .update(creds.apiKey.toLowerCase())
    .digest('hex')
    .toLowerCase();
}
