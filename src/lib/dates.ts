import { TIMEZONE } from '@/config/site';
import type { Lang } from '@/i18n';

const LOCALES: Record<Lang, string> = { ua: 'uk', ru: 'ru', en: 'en', vi: 'vi' };

/** Сегодняшняя дата YYYY-MM-DD в часовом поясе Дананга. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now);
}

const toUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, n: number): string {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** 0 = Вс … 6 = Сб */
export function dayOfWeek(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export const isSunday = (iso: string) => dayOfWeek(iso) === 0;
export const isWeekday = (iso: string) => {
  const w = dayOfWeek(iso);
  return w >= 1 && w <= 5;
};

/** Понедельник недели, в которую попадает дата. */
export function weekStart(iso: string): string {
  const w = dayOfWeek(iso);
  return addDays(iso, w === 0 ? -6 : 1 - w);
}

export function weekdayShort(iso: string, lang: Lang): string {
  const s = new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'short', timeZone: 'UTC' })
    .format(toUTC(iso))
    .replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 26.10 */
export const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
/** Сб, 24.10 */
export const labelFull = (iso: string, lang: Lang) => `${weekdayShort(iso, lang)}, ${ddmm(iso)}`;
/** Сб 24.10 */
export const labelShort = (iso: string, lang: Lang) => `${weekdayShort(iso, lang)} ${ddmm(iso)}`;

/** «Сб 24, Пн 26, Вт 27.10» (если месяц один), иначе «Сб 31.10, Пн 02.11». */
export function labelList(days: string[], lang: Lang): string {
  const sorted = [...days].sort();
  if (!sorted.length) return '';
  const sameMonth = sorted.every((x) => x.slice(0, 7) === sorted[0].slice(0, 7));
  if (!sameMonth) return sorted.map((x) => labelShort(x, lang)).join(', ');
  const parts = sorted.map((x) => `${weekdayShort(x, lang)} ${x.slice(8, 10)}`);
  return `${parts.join(', ')}.${sorted[0].slice(5, 7)}`;
}
