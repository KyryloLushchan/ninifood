import { addDays, todayISO, weekStart } from '@/lib/dates';

export type Preset = 'today' | 'week' | 'month' | 'custom' | 'all';

export const PRESETS: [Preset, string][] = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['custom', 'Свой']];

/** Периоды вкладки «Деньги»: те же + «За всё время» (Касса остаётся на PRESETS). */
export const MONEY_PRESETS: [Preset, string][] = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'За всё время'], ['custom', 'Свой']];

/** Границы периода (включительно, YYYY-MM-DD, по Дананг-времени). */
/** `first` — дата первого заказа (для «За всё время»: с первого заказа по сегодня). */
export function periodRange(p: Preset, from: string, to: string, first?: string): [string, string] {
  const t = todayISO();
  if (p === 'all') return [first && first < t ? first : t, t];
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
