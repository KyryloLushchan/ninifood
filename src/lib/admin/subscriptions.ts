import { addDays } from '@/lib/dates';
import type { AdminOrder } from './client';

export type SubFilter = 'active' | 'ending' | 'done' | 'new';
export type DotKind = 'done' | 'ahead' | 'missed';

export interface SubInfo {
  total: number;
  delivered: number;
  firstDay: string;
  lastDay: string;
  /** Ближайший день ≥ сегодня, ещё не отмеченный доставленным. */
  next: string | null;
  /** Есть день доставки ≥ сегодня. */
  hasFuture: boolean;
  dots: { id: number; date: string; kind: DotKind }[];
}

/** Прогресс подписки по дням доставки; `today` — YYYY-MM-DD по Дананг-времени. */
export function subInfo(o: AdminOrder, today: string): SubInfo {
  const days = [...o.order_days].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const dots = days.map((d) => ({ id: d.id, date: d.delivery_date, kind: (d.delivered ? 'done' : d.delivery_date < today ? 'missed' : 'ahead') as DotKind }));
  return {
    total: days.length,
    delivered: days.filter((d) => d.delivered).length,
    firstDay: days[0]?.delivery_date ?? '',
    lastDay: days[days.length - 1]?.delivery_date ?? '',
    next: days.find((d) => !d.delivered && d.delivery_date >= today)?.delivery_date ?? null,
    hasFuture: days.some((d) => d.delivery_date >= today),
    dots,
  };
}

/** Заканчивается: подтверждена, последний день — сегодня или в ближайшие 2 дня. */
export const isEnding = (o: AdminOrder, i: SubInfo, today: string) => o.status === 'confirmed' && i.lastDay >= today && i.lastDay <= addDays(today, 2);

export function matchesFilter(f: SubFilter, o: AdminOrder, i: SubInfo, today: string): boolean {
  switch (f) {
    case 'active':
      return o.status === 'confirmed' && i.hasFuture;
    case 'ending':
      return isEnding(o, i, today);
    case 'new':
      return o.status === 'new';
    case 'done':
      return o.status === 'delivered' || (o.status === 'confirmed' && !i.hasFuture);
  }
}

/** Поиск по нику, телефону (только цифры) и номеру заказа. */
export function matchesQuery(o: AdminOrder, q: string): boolean {
  const s = q.trim().toLowerCase().replace(/^@/, '');
  if (!s) return true;
  const digits = s.replace(/\D/g, '');
  return (
    o.telegram.toLowerCase().replace(/^@/, '').includes(s) ||
    o.order_number.toLowerCase().includes(s) ||
    (digits.length >= 3 && (o.phone ?? '').replace(/\D/g, '').includes(digits))
  );
}

/** Сводка: активные подписки, порции на завтра из подписок, заканчивающиеся (confirmed). */
export function subSummary(orders: AdminOrder[], today: string) {
  const tomorrow = addDays(today, 1);
  let active = 0;
  let tomorrowPortions = 0;
  let ending = 0;
  for (const o of orders) {
    if (o.status !== 'confirmed') continue;
    const i = subInfo(o, today);
    if (i.hasFuture) active++;
    if (isEnding(o, i, today)) ending++;
    for (const d of o.order_days) if (d.delivery_date === tomorrow) tomorrowPortions += d.qty;
  }
  return { active, tomorrowPortions, ending };
}
