export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid data');
  return value as Record<string, unknown>;
}

export function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('invalid data');
  return value;
}

export function finite(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('invalid data');
  return value;
}

export function exact<T extends string | boolean>(value: unknown, expected: T): T {
  if (value !== expected) throw new Error('invalid data');
  return expected;
}

export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('invalid data');
  return value;
}

export function oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error('invalid data');
  return value as T[number];
}

export function timezone(value: unknown): string {
  const name = text(value);
  if (name.length > 64) throw new Error('invalid data');
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
  } catch {
    throw new Error('invalid data');
  }
  return name;
}

export function civilDate(value: unknown): string {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid data');
  const [year, month, day] = date.split('-').map(Number);
  const dateValue = new Date(0);
  dateValue.setUTCFullYear(year ?? 0, (month ?? 0) - 1, day ?? 0);
  const timestamp = dateValue.getTime();
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date)
    throw new Error('invalid data');
  return date;
}
