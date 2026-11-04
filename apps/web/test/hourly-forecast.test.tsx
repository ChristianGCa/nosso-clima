import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoryLabel, parseForecast } from '../src/api/forecast';
import { DailyForecast } from '../src/components/daily-forecast';
import { HourlyDetails } from '../src/components/hourly-forecast';
import { forecastResponse } from './fixtures';

function renderDetails(dayIndex: number, currentHour?: number) {
  const day = parseForecast(forecastResponse).daily[dayIndex];
  if (!day?.hourly) throw new Error('fixture must include hourly data');
  return render(
    <HourlyDetails
      date={day.date}
      hourly={day.hourly}
      {...(currentHour === undefined ? {} : { currentHour })}
    />,
  );
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: /por hora|Ocultar horas/ });
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row');
}

function hourHeaders(): string[] {
  return within(rows()[0] as HTMLElement)
    .getAllByRole('columnheader')
    .slice(1)
    .map((header) => header.textContent ?? '');
}

describe('hourly details inside a daily card', () => {
  it('starts closed and opens with an expanded state', () => {
    renderDetails(1);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toBe('▾Ver por hora');
    expect(toggle().getAttribute('aria-label')).toBe('Ver por hora de Sexta-feira, 25/09');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toContain('Ocultar horas');
    expect(document.getElementById(toggle().getAttribute('aria-controls') ?? '')).not.toBeNull();
    expect(hourHeaders()).toHaveLength(24);
    expect(hourHeaders()[0]).toBe('00h');
    fireEvent.click(toggle());
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows all of today, highlights the current hour and scrolls to it on opening', () => {
    const { container } = renderDetails(0, 15);
    fireEvent.click(toggle());
    const headers = hourHeaders();
    expect(headers).toHaveLength(24);
    expect(headers[0]).toBe('00h');
    // The current hour shows a one-line “Agora”; its hour remains for assistive technology.
    expect(headers[15]).toBe('15h Agora');
    expect(headers.filter((header) => header.includes('Agora'))).toHaveLength(1);
    expect(screen.getByRole('table', { name: 'Previsão por hora de Quinta-feira, 24/09' })).toBe(
      screen.getByRole('table'),
    );
    // One header plus the three body cells of the current column.
    expect(container.querySelectorAll('.hourly-now')).toHaveLength(4);
    for (const row of rows().slice(1)) {
      expect(within(row).getAllByRole('cell')[15]?.classList.contains('hourly-now')).toBe(true);
    }
  });

  it('scrolls the current hour next to the row icons when today opens', () => {
    const rect = (left: number, width: number) => ({ left, width }) as DOMRect;
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getRect(this: HTMLElement) {
      if (this.classList.contains('hourly-scroll')) return rect(10, 300);
      if (this.classList.contains('hourly-now')) return rect(10 + 40 + 15 * 50, 50);
      if (this.tagName === 'TH') return rect(10, 40);
      return original.call(this);
    };
    try {
      renderDetails(0, 15);
      fireEvent.click(toggle());
      expect(screen.getByRole('region', { name: /Previsão por hora de/ }).scrollLeft).toBe(750);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it('does not highlight or scroll other days', () => {
    const { container } = renderDetails(1);
    fireEvent.click(toggle());
    expect(container.querySelector('.hourly-now')).toBeNull();
    expect(screen.getByRole('region', { name: /Previsão por hora de/ }).scrollLeft).toBe(0);
  });

  it('labels rows with icons and keeps their names for assistive technology', () => {
    renderDetails(0, 15);
    fireEvent.click(toggle());
    const [, condition, temperature, rain] = rows();
    expect(within(condition as HTMLElement).getByRole('rowheader').textContent).toBe('Condição');
    expect(within(temperature as HTMLElement).getByRole('rowheader').textContent).toBe(
      'Temperatura',
    );
    expect(within(rain as HTMLElement).getByRole('rowheader').textContent).toBe(
      'Chuva na hora anterior',
    );
    expect(
      within(temperature as HTMLElement)
        .getByRole('rowheader')
        .querySelector('img')
        ?.getAttribute('src'),
    ).toContain('thermometer');
    expect(screen.queryByText(/hora que termina/)).toBeNull();
  });

  it('shows a condition icon per hour, with night variants and a text label', () => {
    renderDetails(0, 15);
    fireEvent.click(toggle());
    const cells = within(rows()[1] as HTMLElement).getAllByRole('cell');
    expect(cells.slice(15).map((cell) => cell.textContent)).toEqual([
      'Limpo',
      'Limpo',
      'Chuva',
      'Tempestade',
      'Limpo',
      'Limpo',
      'Limpo',
      'Limpo',
      'Limpo',
    ]);
    const source = (index: number) => cells[15 + index]?.querySelector('img')?.getAttribute('src');
    expect(source(0)).toContain('clear-day');
    expect(source(2)).toContain('rain');
    expect(source(3)).toContain('thunderstorms-night');
    expect(source(4)).toContain('clear-night');
    expect(categoryLabel('snow')).toBe('Neve');
    expect(categoryLabel('cloudy')).toBe('Nublado');
  });

  it('shows temperature and rain with units under the values and marks unavailable values', () => {
    renderDetails(0, 15);
    fireEvent.click(toggle());
    const temperatures = within(rows()[2] as HTMLElement)
      .getAllByRole('cell')
      .slice(15);
    const rain = within(rows()[3] as HTMLElement)
      .getAllByRole('cell')
      .slice(15);
    expect(temperatures[0]?.querySelector('.hourly-number')?.textContent).toBe('22,5');
    expect(temperatures[0]?.querySelector('.hourly-unit')?.textContent).toBe('°C');
    expect(rain[2]?.querySelector('.hourly-unit')?.textContent).toBe('mm');
    expect(temperatures[1]?.querySelector('.hourly-unit')).toBeNull();
    expect(temperatures[0]?.textContent).toBe('22,5 °C');
    expect(temperatures[1]?.textContent).toBe('—Indisponível');
    expect(
      within(temperatures[1] as HTMLElement)
        .getByText('—')
        .getAttribute('aria-hidden'),
    ).toBe('true');
    expect(rain[2]?.textContent).toBe('0,4 mm');
    expect(rain[0]?.textContent).toBe('0 mm');
  });

  it('keeps the horizontally scrollable table reachable by keyboard', () => {
    renderDetails(1);
    fireEvent.click(toggle());
    const region = screen.getByRole('region', { name: /Previsão por hora de/ });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.contains(screen.getByRole('table'))).toBe(true);
    const rain = within(rows()[3] as HTMLElement).getAllByRole('cell');
    expect(rain[3]?.textContent).toBe('—Indisponível');
  });

  it('keeps the open state out of the URL and browser storage', () => {
    const before = window.location.href;
    renderDetails(2);
    fireEvent.click(toggle());
    expect(window.location.href).toBe(before);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('daily cards with an open hourly panel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubResizeObserver() {
    const callbacks: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    return () => {
      for (const callback of callbacks) callback();
    };
  }

  function renderDaily() {
    const forecast = parseForecast(forecastResponse);
    const view = render(
      <DailyForecast daily={forecast.daily} validAtLocal={forecast.current.validAtLocal} />,
    );
    const strip = view.container.querySelector<HTMLElement>('.daily-strip');
    if (!strip) throw new Error('strip must render');
    return strip;
  }

  function setWidth(strip: HTMLElement, width: number) {
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: width });
  }

  it('keeps the closed card height for the other cards while a panel is open', () => {
    const resize = stubResizeObserver();
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getRect(this: HTMLElement) {
      return this.classList.contains('day-card')
        ? ({ height: 312.5 } as DOMRect)
        : original.call(this);
    };
    try {
      const strip = renderDaily();
      setWidth(strip, 1200);
      resize();
      expect(strip.style.getPropertyValue('--closed-card-height')).toBe('312.5px');

      fireEvent.click(screen.getByRole('button', { name: 'Ver por hora de Sexta-feira, 25/09' }));
      resize();
      expect(strip.style.getPropertyValue('--closed-card-height')).toBe('312.5px');

      // A width change while open cannot be measured closed: drop the stale value.
      setWidth(strip, 900);
      resize();
      expect(strip.style.getPropertyValue('--closed-card-height')).toBe('');

      fireEvent.click(screen.getByRole('button', { name: 'Ocultar horas de Sexta-feira, 25/09' }));
      resize();
      expect(strip.style.getPropertyValue('--closed-card-height')).toBe('312.5px');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it('works without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const strip = renderDaily();
    fireEvent.click(screen.getByRole('button', { name: 'Ver por hora de Sexta-feira, 25/09' }));
    expect(strip.style.getPropertyValue('--closed-card-height')).toBe('');
  });
});
