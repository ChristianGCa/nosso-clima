import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

const WINDOW_MS = 60_000;

export class InvalidVisitorIdentity extends Error {
  constructor() {
    super('Visitor identity unavailable');
    this.name = 'InvalidVisitorIdentity';
  }
}

export type VisitorIdentity = Readonly<{ digest: string; bucket: number }>;

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

    const canonicalIp =
      version === 6 ? new URL(`http://[${forwardedFor}]/`).hostname.slice(1, -1) : forwardedFor;
    const bucket = Math.floor(time / WINDOW_MS);
    const digest = createHmac('sha256', secret).update(`v1:${bucket}:${canonicalIp}`).digest('hex');
    return { digest, bucket };
  };
}
