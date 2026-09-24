import { useEffect, useState } from 'react';
import { backgroundFor } from '../backgrounds';
import type { ForecastState } from './use-forecast';

export function useWeatherBackground(state: ForecastState): string | null {
  const [loaded, setLoaded] = useState<string | null>(null);
  const category = state.status === 'ready' ? state.forecast.current.condition.category : null;
  const isDay = state.status === 'ready' ? state.forecast.current.isDay : null;

  useEffect(() => {
    setLoaded(null);
    if (category === null || isDay === null) return;
    const url = backgroundFor(category, isDay);
    const image = new Image();
    image.onload = () => setLoaded(url);
    image.onerror = () => setLoaded(null);
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [category, isDay]);

  return category === null || isDay === null || loaded !== backgroundFor(category, isDay)
    ? null
    : loaded;
}
