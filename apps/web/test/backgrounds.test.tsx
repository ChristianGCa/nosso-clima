import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseForecast } from '../src/api/forecast';
import { parseLocations } from '../src/api/locations';
import { backgroundFor } from '../src/backgrounds';
import { useWeatherBackground } from '../src/hooks/use-weather-background';
import type { ForecastState } from '../src/hooks/use-forecast';
import { forecastResponse, locationResponse } from './fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('weather backgrounds', () => {
  it.each([
    ['clear', 'limpo', 'limpa'],
    ['cloudy', 'nublado', 'nublada'],
    ['rain', 'chuvoso', 'chuvosa'],
    ['snow', 'neve', 'neve'],
    ['storm', 'tempestade', 'tempestade'],
  ] as const)('maps %s to its day and night WebP', (category, day, night) => {
    expect(backgroundFor(category, true)).toContain(`dia-${day}.webp`);
    expect(backgroundFor(category, false)).toContain(`noite-${night}.webp`);
  });

  it('loads only the active image and returns to neutral for loading or image failure', () => {
    const images: Array<{
      src: string;
      onload: null | (() => void);
      onerror: null | (() => void);
    }> = [];
    class FakeImage {
      private value = '';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      constructor() {
        images.push(this);
      }
      get src() {
        return this.value;
      }
      set src(value: string) {
        this.value = value;
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const location = parseLocations(locationResponse).locations[0];
    if (!location) throw new Error('missing fixture location');
    const forecast = parseForecast(forecastResponse);
    const idle: ForecastState = { status: 'idle' };
    const ready: ForecastState = { status: 'ready', location, forecast };
    const { result, rerender } = renderHook(
      ({ state }: { state: ForecastState }) => useWeatherBackground(state),
      { initialProps: { state: idle as ForecastState } },
    );
    expect(result.current).toBeNull();
    expect(images).toHaveLength(0);
    rerender({ state: ready });
    expect(images).toHaveLength(1);
    expect(result.current).toBeNull();
    act(() => images[0]?.onload?.());
    expect(result.current).toContain('dia-limpo.webp');
    rerender({ state: { status: 'loading', location } });
    expect(result.current).toBeNull();
    rerender({ state: ready });
    expect(images).toHaveLength(2);
    act(() => images[1]?.onerror?.());
    expect(result.current).toBeNull();
  });
});
