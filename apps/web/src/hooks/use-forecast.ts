import { useEffect, useRef, useState } from 'react';
import type { Location } from '../api/locations';
import { getForecast, type Forecast } from '../api/forecast';
import { unavailableFrom, type RequestFailure } from '../api/http';

export type ForecastState =
  | { status: 'idle' }
  | { status: 'loading'; location: Location }
  | { status: 'ready'; location: Location; forecast: Forecast }
  | { status: 'error'; location: Location; failure: RequestFailure };

export function useForecast() {
  const [selected, setSelected] = useState<Location | null>(null);
  const [state, setState] = useState<ForecastState>({ status: 'idle' });
  const requestId = useRef(0);

  useEffect(() => {
    if (!selected) return;
    const location = selected;
    const id = ++requestId.current;
    const controller = new AbortController();
    setState({ status: 'loading', location });
    getForecast(location, controller.signal)
      .then((forecast) => {
        if (requestId.current === id) setState({ status: 'ready', location, forecast });
      })
      .catch((error: unknown) => {
        if (requestId.current === id)
          setState({ status: 'error', location, failure: unavailableFrom(error).failure });
      });
    return () => {
      requestId.current += 1;
      controller.abort();
    };
  }, [selected]);

  function choose(location: Location) {
    requestId.current += 1;
    setState({ status: 'loading', location });
    setSelected(location);
  }

  return {
    state,
    choose,
    retry: () => setSelected((location) => (location ? { ...location } : null)),
  };
}
