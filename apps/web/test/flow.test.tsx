import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app';
import { forecastResponse, jsonResponse, locationResponse } from './fixtures';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advanceSearch() {
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });
}

async function resolveUpdates() {
  await act(async () => {
    await Promise.resolve();
  });
}

function input(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Buscar cidade' });
}

describe('city-to-forecast flow', () => {
  it('waits for three Unicode characters and 300 ms, then selects by keyboard', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (path) =>
        String(path).includes('/locations')
          ? jsonResponse(locationResponse)
          : jsonResponse(forecastResponse),
      );
    render(<App />);
    fireEvent.change(input(), { target: { value: 'Sã' } });
    await advanceSearch();
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: 'São' } });
    act(() => vi.advanceTimersByTime(299));
    expect(fetchSpy).not.toHaveBeenCalled();
    await advanceSearch();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('1 cidade encontrada');
    expect(screen.getByRole('link', { name: 'GeoNames' })).toBeTruthy();
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).toBe('city-option-0');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await resolveUpdates();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'São Paulo, São Paulo, Brasil' })).toBeTruthy();
    expect(screen.getAllByText('Indisponível')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Previsão de 7 dias' })).toBeTruthy();
    expect(screen.getAllByText('Condição mais severa')).toHaveLength(7);
    expect(screen.getByText(/Dados adaptados pelo Nosso Clima sob/)).toBeTruthy();
  });

  it('keeps the selected forecast while editing and clears it on a new selection', async () => {
    vi.useFakeTimers();
    let resolveSecondForecast: ((value: Response) => void) | undefined;
    let forecastCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (String(path).includes('/locations'))
        return jsonResponse({
          ...locationResponse,
          locations: [
            locationResponse.locations[0],
            { ...locationResponse.locations[0], id: 2, name: 'Santos' },
          ],
        });
      forecastCalls += 1;
      if (forecastCalls === 1) return jsonResponse(forecastResponse);
      return new Promise<Response>((resolve) => {
        resolveSecondForecast = resolve;
      });
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option', { name: 'São Paulo, São Paulo, Brasil' }));
    await resolveUpdates();
    expect(screen.getByRole('heading', { name: 'Previsão de 7 dias' })).toBeTruthy();
    fireEvent.change(input(), { target: { value: 'San' } });
    expect(screen.getByRole('heading', { name: 'Previsão de 7 dias' })).toBeTruthy();
    await advanceSearch();
    fireEvent.click(screen.getByRole('option', { name: 'Santos, São Paulo, Brasil' }));
    expect(screen.queryByRole('heading', { name: 'Previsão de 7 dias' })).toBeNull();
    expect(screen.getByText('Carregando previsão…')).toBeTruthy();
    await act(async () => {
      resolveSecondForecast?.(jsonResponse(forecastResponse));
    });
    expect(screen.getByRole('heading', { name: 'Santos, São Paulo, Brasil' })).toBeTruthy();
  });

  it('distinguishes no results, search failure and explicit search retry', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ ...locationResponse, locations: [] });
      if (calls === 2) return jsonResponse({ error: { code: 'RATE_LIMITED' } }, 429);
      return jsonResponse(locationResponse);
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'Sao' } });
    await advanceSearch();
    expect(screen.getByText('Nenhuma cidade encontrada.')).toBeTruthy();
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    expect(screen.getByText(/Muitas buscas agora/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await advanceSearch();
    expect(screen.getByRole('option', { name: 'São Paulo, São Paulo, Brasil' })).toBeTruthy();
  });

  it('shows a generic search error without losing the selected forecast', async () => {
    vi.useFakeTimers();
    let searchCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (String(path).includes('/forecast')) return jsonResponse(forecastResponse);
      searchCalls += 1;
      return searchCalls === 1
        ? jsonResponse(locationResponse)
        : jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'private' } }, 503);
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option'));
    await resolveUpdates();
    fireEvent.change(input(), { target: { value: 'Cur' } });
    await advanceSearch();
    expect(screen.getByText(/A busca está temporariamente indisponível/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Previsão de 7 dias' })).toBeTruthy();
    expect(screen.queryByText('private')).toBeNull();
  });

  it('shows a forecast rate limit and retries only on request', async () => {
    vi.useFakeTimers();
    let forecastCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (String(path).includes('/locations')) return jsonResponse(locationResponse);
      forecastCalls += 1;
      return forecastCalls === 1
        ? jsonResponse({ error: { code: 'RATE_LIMITED' } }, 429)
        : jsonResponse(forecastResponse);
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option'));
    await resolveUpdates();
    expect(screen.getByText(/Muitas consultas agora/)).toBeTruthy();
    expect(screen.getByText('Referência de suporte: test-request-1')).toBeTruthy();
    expect(forecastCalls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await resolveUpdates();
    expect(forecastCalls).toBe(2);
    expect(screen.getByRole('heading', { name: 'Previsão de 7 dias' })).toBeTruthy();
  });

  it('keeps unavailable forecast errors generic for 503 and malformed data', async () => {
    vi.useFakeTimers();
    let forecastCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (String(path).includes('/locations')) return jsonResponse(locationResponse);
      forecastCalls += 1;
      if (forecastCalls === 1)
        return jsonResponse(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'private detail' } },
          503,
        );
      if (forecastCalls === 2) return jsonResponse({ ...forecastResponse, daily: [] });
      return jsonResponse(forecastResponse);
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option'));
    await resolveUpdates();
    expect(screen.getByText('A previsão está temporariamente indisponível.')).toBeTruthy();
    expect(screen.queryByText('private detail')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await resolveUpdates();
    expect(screen.getByText('A previsão está temporariamente indisponível.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await resolveUpdates();
    expect(screen.getByRole('heading', { name: 'Previsão de 7 dias' })).toBeTruthy();
    expect(forecastCalls).toBe(3);
  });

  it('closes suggestions with Escape and exposes source credit while open', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(locationResponse));
    render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    expect(screen.getByRole('option')).toBeTruthy();
    expect(
      within(screen.getByText(/Busca por/)).getByRole('link', { name: 'GeoNames' }),
    ).toBeTruthy();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('ignores an older search response after the query changes', async () => {
    vi.useFakeTimers();
    let resolveOld: ((value: Response) => void) | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (fetchSpy.mock.calls.length === 1) {
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      }
      return jsonResponse(locationResponse);
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'Cur' } });
    await advanceSearch();
    const options = fetchSpy.mock.calls[0]?.[1];
    if (!options) throw new Error('missing request options');
    const oldSignal = options.signal;
    fireEvent.change(input(), { target: { value: 'São' } });
    expect(oldSignal?.aborted).toBe(true);
    await advanceSearch();
    await act(async () => {
      resolveOld?.(
        jsonResponse({
          ...locationResponse,
          locations: [{ ...locationResponse.locations[0], name: 'Curitiba' }],
        }),
      );
    });
    expect(screen.getByRole('option', { name: 'São Paulo, São Paulo, Brasil' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Curitiba/ })).toBeNull();
  });

  it('ignores an older forecast even when its transport resolves after abort', async () => {
    vi.useFakeTimers();
    let resolveOld: ((value: Response) => void) | undefined;
    let forecastCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (String(path).includes('/locations'))
        return jsonResponse({
          ...locationResponse,
          locations: [
            locationResponse.locations[0],
            { ...locationResponse.locations[0], id: 2, name: 'Santos' },
          ],
        });
      forecastCalls += 1;
      if (forecastCalls === 1)
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      return jsonResponse(forecastResponse);
    });
    render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option', { name: 'São Paulo, São Paulo, Brasil' }));
    fireEvent.change(input(), { target: { value: 'San' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option', { name: 'Santos, São Paulo, Brasil' }));
    await resolveUpdates();
    await act(async () => {
      resolveOld?.(jsonResponse(forecastResponse));
    });
    expect(screen.getByRole('heading', { name: 'Santos, São Paulo, Brasil' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'São Paulo, São Paulo, Brasil' })).toBeNull();
  });

  it('aborts an outstanding search when the view unmounts', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Promise<Response>(() => {}));
    const view = render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    const signal = fetchSpy.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('aborts an outstanding forecast when the view unmounts', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (path) =>
        String(path).includes('/locations')
          ? jsonResponse(locationResponse)
          : new Promise<Response>(() => {}),
      );
    const view = render(<App />);
    fireEvent.change(input(), { target: { value: 'São' } });
    await advanceSearch();
    fireEvent.click(screen.getByRole('option'));
    const signal = fetchSpy.mock.calls.find(([path]) => String(path).includes('/forecast'))?.[1]
      ?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
