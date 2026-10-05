import { describe, expect, it } from 'vitest';

import {
  createVisitorIdentity,
  InvalidVisitorIdentity,
} from '../../src/infrastructure/visitor-identity.js';

const secret = 'ab'.repeat(32);

describe('temporary visitor identity', () => {
  it('derives an opaque, minute-scoped digest without returning the IP', () => {
    let now = 60_000;
    const identify = createVisitorIdentity(secret, () => now);
    const first = identify('203.0.113.10');
    const sameMinute = identify('203.0.113.10');
    const otherVisitor = identify('203.0.113.11');
    now = 120_000;
    const nextMinute = identify('203.0.113.10');

    expect(first).toMatchObject({ digest: expect.stringMatching(/^[0-9a-f]{64}$/), bucket: 1 });
    expect(first.neighborDigests).toHaveLength(3);
    expect(first.neighborDigests[1]).toBe(first.digest);
    expect(sameMinute).toEqual(first);
    expect(otherVisitor.digest).not.toBe(first.digest);
    expect(nextMinute.digest).not.toBe(first.digest);
    expect(nextMinute.neighborDigests[0]).toBe(first.digest);
    expect(JSON.stringify(first)).not.toContain('203.0.113.10');
  });

  it('canonicalizes equivalent IPv6 spellings before hashing', () => {
    const identify = createVisitorIdentity(secret, () => 60_000);
    expect(identify('2001:0db8:0000:0000:0000:0000:0000:0001')).toEqual(identify('2001:db8::1'));
  });

  it('groups IPv6 addresses within one /64 without grouping adjacent networks', () => {
    const identify = createVisitorIdentity(secret, () => 60_000);
    expect(identify('2001:db8:abcd:1234::1')).toEqual(identify('2001:db8:abcd:1234::2'));
    expect(identify('2001:db8:abcd:1235::1').digest).not.toBe(
      identify('2001:db8:abcd:1234::1').digest,
    );
  });

  it('keeps IPv4-mapped IPv6 visitors distinct', () => {
    const identify = createVisitorIdentity(secret, () => 60_000);
    expect(identify('::ffff:192.0.2.1').digest).not.toBe(identify('::ffff:192.0.2.2').digest);
    expect(identify('::ffff:192.0.2.1').digest).toBe(identify('192.0.2.1').digest);
  });

  it.each([
    undefined,
    ['203.0.113.10'],
    '203.0.113.10, 198.51.100.2',
    ' 203.0.113.10',
    '203.0.113.10 ',
    'unknown',
    '203.0.113.10:443',
    '2001:db8::1, 2001:db8::2',
  ])('rejects missing, ambiguous or malformed forwarded identity %s', (header) => {
    const identify = createVisitorIdentity(secret, () => 60_000);
    expect(() => identify(header)).toThrow(InvalidVisitorIdentity);
  });

  it('rejects invalid HMAC configuration at startup', () => {
    expect(() => createVisitorIdentity('short')).toThrow('Invalid visitor identity secret');
  });
});
