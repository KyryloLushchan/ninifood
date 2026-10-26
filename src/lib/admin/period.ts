import { addDays, todayISO, weekStart } from '@/lib/dates';

export type Preset = 'today' | 'week' | 'month' | 'custom';

export const PRESETS: [Preset, string][] = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['custom', 'Свой']];

/** Границы периода (включительно, YYYY-MM-DD, по Дананг-времени). */
export function periodRange(p: Preset, from: string, to: string): [string, string] {
  const t = todayISO();
  if (p === 'today') return [t, t];
  if (p === 'week') {
    const m = weekStart(t);
    return [m, addDays(m, 6)];
  }
  if (p === 'month') {
    const first = `${t.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7), 1)).toISOString().slice(0, 10);
    return [first, addDays(next, -1)];
  }
  return [from, to < from ? from : to];
}
