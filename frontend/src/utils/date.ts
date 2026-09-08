export const APP_TIME_ZONE = 'America/Sao_Paulo';

export function dateInputValueFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayInBrasilia(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function monthBounds(monthStr: string): { start: string; end: string } {
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: dateInputValueFromParts(year, month, 1),
    end: dateInputValueFromParts(year, month, lastDay),
  };
}
