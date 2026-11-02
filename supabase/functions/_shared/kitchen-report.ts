import { labelRu } from './dates.ts';

/** Порции рейса для кухни: подтверждённые (+ доставленные) и ждущие подтверждения (⏳). */
export interface KitchenTrip {
  portions: number;
  pending: number;
}

/**
 * «🍱 Порции на Пт, 31.10: 18 + 2 = 20» (+ «🍴 Приборов: N», если есть). Сообщение для повара/компаньона (группа NiniFood Ops).
 * trips — порции по рейсам (по курьерам; рейсы строятся и по неподтверждённым заказам, у них «⏳»): «🚚 Рейс 1 — 9 · Рейс 2 — 2 (⏳ 1)»;
 * unplaced — порции доставок без координат (в рейсы не входят).
 */
export function buildKitchenMessage(date: string, portions: number, extra: number, cutlery: number, trips?: KitchenTrip[][], unplaced = 0): string {
  const label = labelRu(date).replace(' ', ', ');
  const lines = [`🍱 <b>Порции на ${label}: ${portions} + ${extra} = ${portions + extra}</b>`];
  if (cutlery > 0) lines.push(`🍴 Приборов: ${cutlery}`);
  const fmt = (t: KitchenTrip, i: number) => `Рейс ${i + 1} — ${t.portions}${t.pending > 0 ? ` (⏳ ${t.pending})` : ''}`;
  if (trips && trips.length === 1) lines.push(`🚚 ${trips[0].map(fmt).join(' · ')}`);
  else if (trips && trips.length > 1) trips.forEach((c, ci) => lines.push(`🛵 Курьер ${ci + 1}: ${c.map(fmt).join(' · ')}`));
  if (unplaced > 0) lines.push(`📍 Без точки на карте: ${unplaced}`);
  return lines.join('\n');
}
