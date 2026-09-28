import { describe, expect, it } from 'vitest';
import { dayLabel, localClock, metric, retrievedTime } from '../src/format/weather-format';

describe('Portuguese weather formatting', () => {
  it('keeps offset-less local time and converts retrieval time to the selected timezone', () => {
    expect(localClock('2026-09-24T15:30')).toBe('15:30');
    expect(retrievedTime('2026-09-24T18:32:00.000Z', 'America/Sao_Paulo')).toContain('15:32');
  });

  it('formats civil dates without the viewer timezone', () => {
    expect(dayLabel('2026-09-24')).toBe('Quinta-feira, 24/09');
  });

  it('does not turn unavailable values into zero', () => {
    expect(metric(null, '%')).toBe('Indisponível');
    expect(metric(8.4, 'mm')).toBe('8,4 mm');
  });
});
