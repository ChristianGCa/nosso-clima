import { describe, expect, it } from 'vitest';

import { mapUvRisk, mapWmoCondition } from '../../src/forecast/wmo-condition.js';

describe('WMO condition mapping', () => {
  it.each([
    [0, 'clear', 'Limpo'],
    [1, 'clear', 'Limpo'],
    [2, 'cloudy', 'Nublado'],
    [3, 'cloudy', 'Nublado'],
    [45, 'cloudy', 'Nublado'],
    [48, 'cloudy', 'Nublado'],
    [51, 'rain', 'Chuva'],
    [53, 'rain', 'Chuva'],
    [55, 'rain', 'Chuva'],
    [56, 'rain', 'Chuva'],
    [57, 'rain', 'Chuva'],
    [61, 'rain', 'Chuva'],
    [63, 'rain', 'Chuva'],
    [65, 'rain', 'Chuva'],
    [66, 'rain', 'Chuva'],
    [67, 'rain', 'Chuva'],
    [80, 'rain', 'Chuva'],
    [81, 'rain', 'Chuva'],
    [82, 'rain', 'Chuva'],
    [71, 'snow', 'Neve'],
    [73, 'snow', 'Neve'],
    [75, 'snow', 'Neve'],
    [77, 'snow', 'Neve'],
    [85, 'snow', 'Neve'],
    [86, 'snow', 'Neve'],
    [95, 'storm', 'Tempestade'],
    [96, 'storm', 'Tempestade'],
    [99, 'storm', 'Tempestade'],
  ] as const)('maps code %d to %s/%s', (code, category, labelPt) => {
    expect(mapWmoCondition(code)).toEqual({ code, category, labelPt });
  });

  it.each([4, 49, 68, 79, 83, 94, 97, 98, -1, 1.5, '61', null, undefined, NaN])(
    'fails closed for unknown or malformed code %s',
    (code) => {
      expect(mapWmoCondition(code)).toBeUndefined();
    },
  );
});

describe('UV risk mapping', () => {
  it.each([
    [0, 'low'],
    [2.999, 'low'],
    [3, 'moderate'],
    [5.999, 'moderate'],
    [6, 'high'],
    [7.999, 'high'],
    [8, 'very_high'],
    [10.999, 'very_high'],
    [11, 'extreme'],
    [42.5, 'extreme'],
  ] as const)('maps UV %d to %s', (value, risk) => {
    expect(mapUvRisk(value)).toBe(risk);
  });

  it('keeps an unavailable provider metric as null', () => {
    expect(mapUvRisk(null)).toBeNull();
  });

  it.each([-0.001, -1, Number.NaN, Number.POSITIVE_INFINITY, '7', undefined])(
    'fails closed for invalid UV %s',
    (value) => {
      expect(mapUvRisk(value)).toBeUndefined();
    },
  );
});
