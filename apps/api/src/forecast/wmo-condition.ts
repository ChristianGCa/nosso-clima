export type ConditionCategory = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';
export type UvRisk = 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';

export type WmoCondition = Readonly<{
  code: number;
  category: ConditionCategory;
  labelPt: 'Limpo' | 'Nublado' | 'Chuva' | 'Neve' | 'Tempestade';
}>;

const CONDITIONS: ReadonlyMap<number, Omit<WmoCondition, 'code'>> = new Map([
  [0, { category: 'clear', labelPt: 'Limpo' }],
  [1, { category: 'clear', labelPt: 'Limpo' }],
  [2, { category: 'cloudy', labelPt: 'Nublado' }],
  [3, { category: 'cloudy', labelPt: 'Nublado' }],
  [45, { category: 'cloudy', labelPt: 'Nublado' }],
  [48, { category: 'cloudy', labelPt: 'Nublado' }],
  [51, { category: 'rain', labelPt: 'Chuva' }],
  [53, { category: 'rain', labelPt: 'Chuva' }],
  [55, { category: 'rain', labelPt: 'Chuva' }],
  [56, { category: 'rain', labelPt: 'Chuva' }],
  [57, { category: 'rain', labelPt: 'Chuva' }],
  [61, { category: 'rain', labelPt: 'Chuva' }],
  [63, { category: 'rain', labelPt: 'Chuva' }],
  [65, { category: 'rain', labelPt: 'Chuva' }],
  [66, { category: 'rain', labelPt: 'Chuva' }],
  [67, { category: 'rain', labelPt: 'Chuva' }],
  [80, { category: 'rain', labelPt: 'Chuva' }],
  [81, { category: 'rain', labelPt: 'Chuva' }],
  [82, { category: 'rain', labelPt: 'Chuva' }],
  [71, { category: 'snow', labelPt: 'Neve' }],
  [73, { category: 'snow', labelPt: 'Neve' }],
  [75, { category: 'snow', labelPt: 'Neve' }],
  [77, { category: 'snow', labelPt: 'Neve' }],
  [85, { category: 'snow', labelPt: 'Neve' }],
  [86, { category: 'snow', labelPt: 'Neve' }],
  [95, { category: 'storm', labelPt: 'Tempestade' }],
  [96, { category: 'storm', labelPt: 'Tempestade' }],
  [99, { category: 'storm', labelPt: 'Tempestade' }],
]);

export function mapWmoCondition(code: unknown): WmoCondition | undefined {
  if (typeof code !== 'number' || !Number.isInteger(code)) return undefined;
  const condition = CONDITIONS.get(code);
  return condition === undefined ? undefined : { code, ...condition };
}

export function mapUvRisk(value: unknown): UvRisk | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  if (value < 3) return 'low';
  if (value < 6) return 'moderate';
  if (value < 8) return 'high';
  if (value < 11) return 'very_high';
  return 'extreme';
}
