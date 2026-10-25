const TZ = 'Asia/Ho_Chi_Minh';

export const todayISO = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);

const toUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayOfWeek = (iso: string) => toUTC(iso).getUTCDay();
export const isSunday = (iso: string) => dayOfWeek(iso) === 0;
export const isWeekday = (iso: string) => dayOfWeek(iso) >= 1 && dayOfWeek(iso) <= 5;

const WD_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
/** «Сб 24.10» */
export const labelRu = (iso: string) => `${WD_RU[dayOfWeek(iso)]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** «24.10 15:42» по времени Дананга */
export function nowDanang(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('day')}.${g('month')} ${g('hour')}:${g('minute')}`;
}
