import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { canUpdateOtherUser, getHmac, hasApiRole, roleAtLeast } from './api-user.utils';

describe('API user utils', () => {
  test('HMAC idempotency', () => {
    const genHmac = () => getHmac({ apiKey: 'key', apiSecret: 'secret' });
    const expected = '96de09a0f8699191b28587118ac57df88bbf6c2d0c131d196dcd90f7efd68c93';
    expect(genHmac()).toBe(expected);
    expect(genHmac()).toBe(expected);
  });

  it('should have the correct roles', () => {
    expect(hasApiRole(ApiRole.Admin, ApiRole.Admin)).toBe(true);
    expect(hasApiRole(ApiRole.Guest, ApiRole.User)).toBe(false);
  });

  it('should be able to check the minimum required permission of a role', () => {
    expect(roleAtLeast(ApiRole.Admin, ApiRole.SuperAdmin)).toBe(false);
    expect(roleAtLeast(ApiRole.Admin, ApiRole.Admin)).toBe(true);
    expect(roleAtLeast(ApiRole.Admin, ApiRole.User)).toBe(true);

    expect(roleAtLeast(ApiRole.Admin, { role: ApiRole.User, plus: 1 })).toBe(true);
    expect(roleAtLeast(ApiRole.Admin, { role: ApiRole.Admin, plus: 1 })).toBe(false);

    expect(roleAtLeast(ApiRole.Admin, { role: ApiRole.Admin, plus: -999 })).toBe(true);
    expect(roleAtLeast(ApiRole.Admin, { role: ApiRole.Admin, plus: 999 })).toBe(false);
  });

  test.each([
    [ApiRole.SuperAdmin, ApiRole.SuperAdmin, true],
    [ApiRole.SuperAdmin, ApiRole.Admin, true],
    [ApiRole.SuperAdmin, ApiRole.User, true],
    [ApiRole.SuperAdmin, ApiRole.Guest, true],

    [ApiRole.Admin, ApiRole.Admin, false],
    [ApiRole.Admin, ApiRole.SuperAdmin, false],
    [ApiRole.Admin, ApiRole.User, true],
    [ApiRole.Admin, ApiRole.Guest, true],

    [ApiRole.User, ApiRole.Admin, false],
    [ApiRole.User, ApiRole.SuperAdmin, false],
    [ApiRole.User, ApiRole.User, false],
    [ApiRole.User, ApiRole.Guest, false],

    [ApiRole.Guest, ApiRole.Admin, false],
    [ApiRole.Guest, ApiRole.SuperAdmin, false],
    [ApiRole.Guest, ApiRole.User, false],
    [ApiRole.Guest, ApiRole.Guest, false]
  ])('test whether user with role %s can update another user with role %s', (currentUser, otherUser, expected) => {
    expect(canUpdateOtherUser(currentUser, otherUser)).toBe(expected);
  });
});
