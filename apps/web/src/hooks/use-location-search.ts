import { useEffect, useRef, useState } from 'react';
import { searchLocations, type LocationSearch } from '../api/locations';
import { unavailableFrom, type RequestFailure } from '../api/http';

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: LocationSearch }
  | { status: 'error'; failure: RequestFailure };

export function useLocationSearch() {
  const [input, setInput] = useState({ query: '', attempt: 0 });
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const requestId = useRef(0);
  const selectedText = useRef<string | null>(null);

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    const trimmed = input.query.trim();
    if ([...trimmed].length < 3 || input.query === selectedText.current) {
      setState({ status: 'idle' });
      return () => {
        requestId.current += 1;
        controller.abort();
      };
    }
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      searchLocations(trimmed, controller.signal)
        .then((result) => {
          if (requestId.current === id) setState({ status: 'ready', result });
        })
        .catch((error: unknown) => {
          if (requestId.current === id)
            setState({ status: 'error', failure: unavailableFrom(error).failure });
        });
    }, 300);
    return () => {
      requestId.current += 1;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  function edit(value: string) {
    requestId.current += 1;
    selectedText.current = null;
    setInput({ query: value, attempt: 0 });
  }

  function choose(name: string) {
    selectedText.current = name;
    setInput({ query: name, attempt: 0 });
    setState({ status: 'idle' });
  }

  function close() {
    requestId.current += 1;
    setState({ status: 'idle' });
  }

  return {
    query: input.query,
    state,
    edit,
    choose,
    close,
    retry: () => setInput((value) => ({ ...value, attempt: value.attempt + 1 })),
  };
}
