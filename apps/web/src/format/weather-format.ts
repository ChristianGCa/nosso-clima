const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function metric(value: number | null, unit: string): string {
  return value === null ? 'Indisponível' : `${numberFormat.format(value)}${unit ? ` ${unit}` : ''}`;
}

export function localClock(validAtLocal: string): string {
  return validAtLocal.slice(11, 16);
}

export function retrievedTime(retrievedAtUtc: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(retrievedAtUtc));
}

export function dayLabel(date: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(
    instant,
  );
  const dayMonth = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(instant);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`;
}

export function compactDayLabel(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
