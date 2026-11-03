import { type BeforeSendEvent, inject } from '@vercel/analytics';

/** Browser objects that may expose privacy signals; non-standard properties are read defensively. */
type PrivacySignals = { navigator: object; window: object };

type StartOptions = {
  production: boolean;
  origin?: string;
  signals?: PrivacySignals;
  injectScript?: typeof inject;
};

const doNotTrackValues = new Set(['1', 'yes']);

function read(source: object, key: string): unknown {
  return Reflect.get(source, key);
}

/** Global Privacy Control or Do Not Track means the visitor opted out of audience measurement. */
export function hasOptOutSignal({ navigator, window }: PrivacySignals): boolean {
  return (
    read(navigator, 'globalPrivacyControl') === true ||
    doNotTrackValues.has(String(read(navigator, 'doNotTrack'))) ||
    doNotTrackValues.has(String(read(window, 'doNotTrack')))
  );
}

/** Keeps only origin and path, so query strings and fragments never reach the measurement. */
export function reduceToPath(event: BeforeSendEvent, origin: string): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return { ...event, url: `${url.origin}${url.pathname}` };
}

/** Starts aggregated page-view measurement in production builds unless the visitor opted out. */
export function startAnalytics({
  production,
  origin = globalThis.location.origin,
  signals = { navigator: globalThis.navigator, window: globalThis },
  injectScript = inject,
}: StartOptions): boolean {
  if (!production || hasOptOutSignal(signals)) return false;
  injectScript({
    mode: 'production',
    beforeSend: (event) => reduceToPath(event, origin),
  });
  return true;
}
