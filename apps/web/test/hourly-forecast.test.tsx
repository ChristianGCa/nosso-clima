import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseForecast } from '../src/api/forecast';
import { HourlyForecast } from '../src/components/hourly-forecast';
import { forecastResponse } from './fixtures';

function renderHourly() {
  const forecast = parseForecast(forecastResponse);
  const daily = forecast.daily.map((day) => {
    if (day.hourly === null) throw new Error('fixture must include hourly data');
    return { ...day, hourly: day.hourly };
  });
  return render(<HourlyForecast daily={daily} validAtLocal={forecast.current.validAtLocal} />);
}

function hourHeaders(): string[] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('columnheader')
    .slice(1)
    .map((header) => header.textContent ?? '');
}

describe('hourly forecast', () => {
  it('starts with today from the hour of the current conditions', () => {
    renderHourly();
    expect(screen.getByRole('heading', { name: 'Previsão por hora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hoje' }).getAttribute('aria-pressed')).toBe('true');
    expect(hourHeaders()).toEqual(['15h', '16h', '17h', '18h', '19h', '20h', '21h', '22h', '23h']);
    expect(screen.getByRole('table', { name: 'Previsão por hora de Quinta-feira, 24/09' })).toBe(
      screen.getByRole('table'),
    );
  });

  it('labels each value by hour and metric, with explicit units', () => {
    renderHourly();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1] as HTMLElement).getByRole('rowheader').textContent).toBe('Temperatura');
    expect(within(rows[2] as HTMLElement).getByRole('rowheader').textContent).toBe(
      'Chuva na hora anterior',
    );
    const temperatures = within(rows[1] as HTMLElement).getAllByRole('cell');
    const rain = within(rows[2] as HTMLElement).getAllByRole('cell');
    expect(temperatures[0]?.textContent).toBe('22,5 °C');
    expect(rain[2]?.textContent).toBe('0,4 mm');
    expect(rain[0]?.textContent).toBe('0 mm');
    expect(
      screen.getByText('A chuva de cada horário é o total previsto para a hora que termina nele.'),
    ).toBeTruthy();
  });

  it('marks unavailable hours without turning them into zero', () => {
    renderHourly();
    const temperatures = within(
      within(screen.getByRole('table')).getAllByRole('row')[1] as HTMLElement,
    ).getAllByRole('cell');
    expect(temperatures[1]?.textContent).toBe('—Indisponível');
    expect(
      within(temperatures[1] as HTMLElement)
        .getByText('—')
        .getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('shows all 24 hours of another day chosen by the person', () => {
    renderHourly();
    const days = within(screen.getByRole('group', { name: 'Escolher dia' })).getAllByRole('button');
    expect(days).toHaveLength(7);
    fireEvent.click(days[1] as HTMLElement);
    expect(days[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(days[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(hourHeaders()).toHaveLength(24);
    expect(hourHeaders()[0]).toBe('00h');
    expect(
      screen.getByRole('table', { name: 'Previsão por hora de Sexta-feira, 25/09' }),
    ).toBeTruthy();
    const rain = within(
      within(screen.getByRole('table')).getAllByRole('row')[2] as HTMLElement,
    ).getAllByRole('cell');
    expect(rain[3]?.textContent).toBe('—Indisponível');
  });

  it('keeps the horizontally scrollable table reachable by keyboard', () => {
    renderHourly();
    const region = screen.getByRole('region', { name: /Previsão por hora de/ });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.contains(screen.getByRole('table'))).toBe(true);
  });

  it('keeps the chosen day out of the URL and browser storage', () => {
    const before = window.location.href;
    renderHourly();
    fireEvent.click(screen.getAllByRole('button')[3] as HTMLElement);
    expect(window.location.href).toBe(before);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
