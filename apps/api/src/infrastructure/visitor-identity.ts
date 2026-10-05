import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

const WINDOW_MS = 60_000;

export class InvalidVisitorIdentity extends Error {
  constructor() {
    super('Visitor identity unavailable');
    this.name = 'InvalidVisitorIdentity';
  }
}

export type VisitorIdentity = Readonly<{
  digest: string;
  bucket: number;
  neighborDigests: readonly [string, string, string];
}>;

export function createVisitorIdentity(
  hexSecret: string,
  now: () => number = Date.now,
): (forwardedFor: unknown) => VisitorIdentity {
  if (!/^[0-9a-f]{64}$/i.test(hexSecret)) {
    throw new Error('Invalid visitor identity secret');
  }
  const secret = Buffer.from(hexSecret, 'hex');

  return (forwardedFor) => {
    if (typeof forwardedFor !== 'string') throw new InvalidVisitorIdentity();
    const version = isIP(forwardedFor);
    if (version === 0) throw new InvalidVisitorIdentity();
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0) throw new InvalidVisitorIdentity();

    const canonicalIp = version === 6 ? normalizeIpv6(forwardedFor) : forwardedFor;
    const bucket = Math.floor(time / WINDOW_MS);
    const digestFor = (minute: number) =>
      createHmac('sha256', secret).update(`v1:${minute}:${canonicalIp}`).digest('hex');
    const neighborDigests = [
      digestFor(bucket - 1),
      digestFor(bucket),
      digestFor(bucket + 1),
    ] as const;
    return { digest: neighborDigests[1], bucket, neighborDigests };
  };
}

function normalizeIpv6(address: string): string {
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left = '', right = ''] = canonical.split('::');
  const leftGroups = left ? left.split(':') : [];
  const rightGroups = right ? right.split(':') : [];
  const groups = [
    ...leftGroups,
    ...Array.from({ length: 8 - leftGroups.length - rightGroups.length }, () => '0'),
    ...rightGroups,
  ].map((group) => Number.parseInt(group, 16));

  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const high = groups[6] ?? 0;
    const low = groups[7] ?? 0;
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  }
  return groups
    .slice(0, 4)
    .map((group) => group.toString(16).padStart(4, '0'))
    .join(':');
}
