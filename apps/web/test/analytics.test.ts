import { describe, expect, it, vi } from 'vitest';
import { hasOptOutSignal, reduceToPath, startAnalytics } from '../src/analytics';

const origin = 'https://nossoclima.example.test';
const noSignals = { navigator: {}, window: {} };

describe('opt-out signals', () => {
  it('has no opt-out without Global Privacy Control or Do Not Track', () => {
    expect(hasOptOutSignal(noSignals)).toBe(false);
    expect(
      hasOptOutSignal({
        navigator: { globalPrivacyControl: false, doNotTrack: '0' },
        window: { doNotTrack: null },
      }),
    ).toBe(false);
    expect(
      hasOptOutSignal({ navigator: { doNotTrack: 'unspecified' }, window: { doNotTrack: '0' } }),
    ).toBe(false);
  });

  it('honours Global Privacy Control only when it is exactly true', () => {
    expect(hasOptOutSignal({ navigator: { globalPrivacyControl: true }, window: {} })).toBe(true);
    expect(hasOptOutSignal({ navigator: { globalPrivacyControl: 'true' }, window: {} })).toBe(
      false,
    );
  });

  it('honours Do Not Track from navigator or window, including the legacy value', () => {
    expect(hasOptOutSignal({ navigator: { doNotTrack: '1' }, window: {} })).toBe(true);
    expect(hasOptOutSignal({ navigator: { doNotTrack: 'yes' }, window: {} })).toBe(true);
    expect(hasOptOutSignal({ navigator: {}, window: { doNotTrack: '1' } })).toBe(true);
  });
});

describe('page view URL reduction', () => {
  it('keeps origin and path and drops query and fragment', () => {
    expect(
      reduceToPath({ type: 'pageview', url: `${origin}/?query=Bel%C3%A9m&lat=-1.4#hoje` }, origin),
    ).toEqual({ type: 'pageview', url: `${origin}/` });
  });

  it('drops events from another origin or with an invalid URL', () => {
    expect(reduceToPath({ type: 'pageview', url: 'https://other.example.test/' }, origin)).toBe(
      null,
    );
    expect(reduceToPath({ type: 'pageview', url: 'not a url' }, origin)).toBe(null);
  });
});

describe('analytics start', () => {
  it('injects the production script with URL reduction when allowed', () => {
    const injectScript = vi.fn();
    expect(startAnalytics({ production: true, origin, signals: noSignals, injectScript })).toBe(
      true,
    );
    expect(injectScript).toHaveBeenCalledTimes(1);
    const [props] = injectScript.mock.calls[0] ?? [];
    expect(Object.keys(props).sort()).toEqual(['beforeSend', 'mode']);
    expect(props.mode).toBe('production');
    expect(props.beforeSend({ type: 'pageview', url: `${origin}/?q=x` })).toEqual({
      type: 'pageview',
      url: `${origin}/`,
    });
  });

  it('never injects outside production builds', () => {
    const injectScript = vi.fn();
    expect(startAnalytics({ production: false, origin, signals: noSignals, injectScript })).toBe(
      false,
    );
    expect(injectScript).not.toHaveBeenCalled();
  });

  it('never injects when the browser sends an opt-out signal', () => {
    const injectScript = vi.fn();
    const signals = { navigator: { globalPrivacyControl: true }, window: {} };
    expect(startAnalytics({ production: true, origin, signals, injectScript })).toBe(false);
    expect(
      startAnalytics({
        production: true,
        origin,
        signals: { navigator: {}, window: { doNotTrack: '1' } },
        injectScript,
      }),
    ).toBe(false);
    expect(injectScript).not.toHaveBeenCalled();
  });

  it('uses the page origin and browser signals by default without touching storage', () => {
    const injectScript = vi.fn();
    expect(startAnalytics({ production: true, injectScript })).toBe(true);
    const [props] = injectScript.mock.calls[0] ?? [];
    expect(props.beforeSend({ type: 'pageview', url: `${location.origin}/#x` })).toEqual({
      type: 'pageview',
      url: `${location.origin}/`,
    });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
