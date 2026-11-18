// Постоянный комментарий кухне для клиента (таблица client_kitchen_notes; SQL `client_kitchen_notes_for` ищет по нику/телефону/аккаунту заказа).
// Блок «📝 Особые пометки:» в «Порции на …» (NiniFood Ops) и отдельное сообщение, если пометку добавили/изменили после ночного отчёта.
import { handle } from './courier-report.ts';
import { buildRoutePlan, type RoutePlan } from './courier-route.ts';
import { planDay } from './trips.ts';
import { esc } from './telegram.ts';
import { errMsg } from './redact.ts';

export interface SpecialNote {
  noteId: number;
  /** № точки в маршруте курьера на этот день: «3», «3.1», «🚕» (такси), «⚠️» (без точки на карте), «—» (плана нет). */
  label: string;
  orders: string[];
  nick: string;
  qty: number;
  note: string;
}

/** План дня (тот же, что у маршрута курьера) по уже загруженным строкам; null — нет координат кухни. */
export function routePlanFromRows(p: { kitchen: any; couriers: 1 | 2; trip: any; override: any; deliveries: any[] }): RoutePlan | null {
  if (!p.kitchen) return null;
  const plan = planDay(p.deliveries, { lat: (d: any) => d.lat, lng: (d: any) => d.lng, address: (d: any) => d.address, qty: (d: any) => d.qty, taxi: (d: any) => d.taxi === true }, p.kitchen, p.couriers, p.trip, p.override);
  return buildRoutePlan('', plan as any, p.couriers);
}

/** Клиенты с комментарием среди доставок дня — в порядке маршрута (рейсы, без точки, такси, затем остальное). Ошибка чтения → [] (отчёт не ломается). */
export async function loadSpecialNotes(db: any, rows: any[], rp: RoutePlan | null): Promise<SpecialNote[]> {
  const ids = [...new Set(rows.map((r) => String(r.orders?.id)).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await db.rpc('client_kitchen_notes_for', { p_orders: ids });
  if (error) {
    console.error('client kitchen notes failed:', errMsg(error));
    return [];
  }
  const noteBy = new Map<string, { id: number; note: string }>((data ?? []).map((x: any) => [String(x.order_id), { id: Number(x.note_id), note: String(x.note) }]));
  if (!noteBy.size) return [];
  const rowByDay = new Map<number, any>(rows.map((r) => [Number(r.id), r]));
  const groups: { label: string; dayIds: number[] }[] = rp ? [...rp.trips.flatMap((t) => t.stops), ...rp.noPoint, ...rp.taxi].map((s) => ({ label: s.label, dayIds: s.dayIds })) : [];
  const covered = new Set(groups.flatMap((g) => g.dayIds));
  for (const r of rows) if (!covered.has(Number(r.id))) groups.push({ label: '—', dayIds: [Number(r.id)] });
  const out: SpecialNote[] = [];
  for (const g of groups) {
    const rs = g.dayIds.map((d) => rowByDay.get(d)).filter(Boolean);
    const withNote = rs.find((r) => noteBy.has(String(r.orders.id)));
    if (!withNote) continue;
    const n = noteBy.get(String(withNote.orders.id))!;
    out.push({
      noteId: n.id,
      label: g.label,
      orders: [...new Set(rs.map((r) => String(r.orders.order_number)))],
      nick: handle(String(withNote.orders.telegram ?? '')),
      qty: rs.reduce((s, r) => s + (Number(r.qty) || 0), 0),
      note: n.note,
    });
  }
  return out;
}

/** «3 · NF-1102 · @nick · 2 порц. — комментарий» (всё экранировано для HTML). */
export const specialNoteLine = (s: SpecialNote) => `${esc(s.label)} · ${esc(s.orders.join(' + '))} · ${esc(s.nick)} · ${s.qty} порц. — ${esc(s.note)}`;
