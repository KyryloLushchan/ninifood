// «Последний день доставки» (settings.last_delivery_date, публичная настройка; пусто — без ограничения). Дни позже него заказать нельзя.
import { addDays, isSunday } from './dates.ts';

/** «ГГГГ-ММ-ДД» или null (нет/пусто/мусор — ограничения нет). */
export function parseLastDay(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

export async function loadLastDay(db: any): Promise<string | null> {
  const { data } = await db.from('settings').select('value').eq('key', 'last_delivery_date').maybeSingle();
  return parseLastDay(data?.value);
}

/** Есть ли после `today` (не включая) и не позже `last` хотя бы один рабочий день (Пн–Сб). Нет ограничения — всегда да. */
export function hasWorkingDayAfter(today: string, last: string | null): boolean {
  if (!last) return true;
  for (let d = addDays(today, 1); d <= last; d = addDays(d, 1)) if (!isSunday(d)) return true;
  return false;
}
