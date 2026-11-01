import { esc } from './telegram.ts';
import { labelRu } from './dates.ts';
import { mapLinkHtml, money, phoneText, subLabel } from './order-text.ts';
import { LONG_ROUTE_KM, planRoutes, type LatLng, type Route } from './route.ts';

export interface ReportDelivery {
  order_number: string;
  telegram: string;
  phone?: string | null;
  address: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  hotel: string | null;
  comment: string | null;
  payment_method: 'qr' | 'cash' | 'other';
  total: number;
  qty: number; // порции за этот день (order_days.qty)
  cutlery?: boolean; // нужны одноразовые приборы
  /** Для подписки: сколько всего дней в заказе и номер этого дня; для разового — null. */
  sub: { total: number; dayNo: number } | null;
  firstDay: boolean; // первый день доставки заказа — наличные берём только в него
  /** Объединённая запись (несколько заказов одного клиента на один адрес): сумма наличных и пометки по подпискам. */
  cashOverride?: number;
  subNotes?: string[];
}

const TG_LIMIT = 4096;
const SAFE = 3900; // запас под заголовок и теги

const handle = (raw: string) => {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `@${h}` : raw.trim();
};

const portions = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'порция' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'порции' : 'порций';
  return `${n} ${w}`;
};

const cashDue = (d: ReportDelivery) => d.cashOverride ?? (d.payment_method === 'cash' && d.firstDay ? d.total : 0);

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? '').trim()).filter(Boolean))];

/** Заказы одного клиента на одной точке за день — одна запись: порции суммируются, номера заказов через « + ». Разные клиенты на одном адресе остаются отдельными. */
export function mergeSameClient(items: ReportDelivery[]): ReportDelivery[] {
  const groups = new Map<string, ReportDelivery[]>();
  for (const d of items) {
    const k = handle(d.telegram).toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0];
    const hotels = uniq(g.map((d) => d.hotel));
    const comments = uniq(g.map((d) => d.comment));
    return {
      ...g[0],
      order_number: g.map((d) => d.order_number).join(' + '),
      qty: g.reduce((n, d) => n + d.qty, 0),
      cutlery: g.some((d) => d.cutlery),
      hotel: hotels.length ? hotels.join(' / ') : null,
      comment: comments.length ? comments.join(' / ') : null,
      phone: g.find((d) => d.phone)?.phone ?? null,
      cashOverride: g.reduce((n, d) => n + cashDue(d), 0),
      subNotes: g.filter((d) => d.sub).map((d) => `${d.order_number}: день ${d.sub!.dayNo} из ${d.sub!.total}`),
      sub: null,
    };
  });
}

function entry(d: ReportDelivery, label: string): string {
  const due = cashDue(d);
  const lines = [`<b>${label}. ${esc(d.order_number)}</b> · ${esc(handle(d.telegram))}`, `📍 <code>${esc(d.address)}</code>`];
  const map = mapLinkHtml(d.lat, d.lng, d.place_id);
  if (map) lines.push(map);
  if (d.hotel) lines.push(`🏨 ${esc(d.hotel)}`);
  if (d.phone) lines.push(`📞 ${esc(phoneText(d.phone))}`);
  if (d.sub) lines.push(`🔁 ${subLabel(d.sub.total)} · день ${d.sub.dayNo} из ${d.sub.total}`);
  if (d.subNotes?.length) lines.push(`🔁 ${d.subNotes.map(esc).join(' · ')}`);
  lines.push(`🍽 <b>${portions(d.qty).toUpperCase()}</b>`);
  if (d.cutlery) lines.push('🍴 <b>ПРИБОРЫ: ДА</b>');
  lines.push(due ? `💵 Взять наличными: <b>${money(due)}</b>` : '✅ Оплачено');
  if (d.comment) lines.push(`💬 ${esc(d.comment)}`);
  return lines.join('\n');
}

const kmText = (km: number) => `≈ ${(Math.round(km * 10) / 10).toString().replace('.', ',')} км (оценка по дорогам)`;
const totals = (list: ReportDelivery[], addresses: number) =>
  `Адресов: ${addresses} · Порций: ${list.reduce((s, d) => s + d.qty, 0)} · Приборов: ${list.filter((d) => d.cutlery).length} · Наличными: ${money(list.reduce((s, d) => s + cashDue(d), 0))}`;

/** Режет куски (заголовки, остановки, ссылки) на сообщения до лимита Telegram, не разрывая кусок. */
function pack(pieces: string[]): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + 2 + p.length > SAFE) {
      chunks.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => (c.length > TG_LIMIT ? c.slice(0, TG_LIMIT) : c));
}

const routeFooter = (r: Route<ReportDelivery>, warnLong: boolean) => {
  const href = (u: string) => u.replace(/&/g, '&amp;');
  const links = r.links.length === 1 ? `<a href="${href(r.links[0])}">Открыть в Google Maps</a>` : r.links.map((u, i) => `<a href="${href(u)}">Маршрут ${i + 1}/${r.links.length}</a>`).join(' · ');
  return [`🗺 ${links}`, `📏 ${kmText(r.km)}`, ...(warnLong && r.km > LONG_ROUTE_KM ? ['⚠️ длинный маршрут, подумай о 2 курьерах'] : [])].join('\n');
};

/**
 * Текст(ы) отчёта на дату; при длине > 4096 режется по границам записей.
 * Есть координаты кухни — остановки в порядке маршрута (1 или 2 курьера, у каждого своя нумерация, итоги и ссылка Google Maps);
 * доставки без координат — отдельный блок. Нет кухни — как раньше, по номеру заказа.
 */
export function buildCourierReport(date: string, deliveries: ReportDelivery[], from: string, to: string, opts?: { kitchen: LatLng | null; couriers: 1 | 2 }): string[] {
  const label = labelRu(date);
  if (deliveries.length === 0) return [`На ${label} доставок нет`];
  const couriers = opts?.couriers ?? 1;
  const kitchen = opts?.kitchen ?? null;
  const byNumber = (a: ReportDelivery, b: ReportDelivery) => a.order_number.localeCompare(b.order_number);

  if (!kitchen) {
    const list = [...deliveries].sort(byNumber);
    return pack([[`📦 <b>Доставки на ${label} — ${from}–${to}</b>`, totals(list, list.length)].join('\n'), ...list.map((d, i) => entry(d, String(i + 1)))]);
  }

  const plan = planRoutes([...deliveries].sort(byNumber), { lat: (d) => d.lat, lng: (d) => d.lng, address: (d) => d.address, qty: (d) => d.qty }, kitchen, couriers);
  const stopsTotal = plan.routes.reduce((s, r) => s + r.stops.length, 0) + plan.noPoint.length;
  const pieces: string[] = [[`📦 <b>Доставки на ${label} — ${from}–${to}</b>`, totals(plan.routes.flatMap((r) => r.stops.flatMap((s) => mergeSameClient(s.items))).concat(plan.noPoint), stopsTotal)].join('\n')];
  plan.routes.forEach((r, ri) => {
    const merged = r.stops.map((s) => mergeSameClient(s.items));
    const items = merged.flat();
    if (couriers === 2) pieces.push(`🛵 <b>Курьер ${ri + 1}</b>\n${totals(items, r.stops.length)} · ${kmText(r.km)}`);
    merged.forEach((list, si) => list.forEach((d, k) => pieces.push(entry(d, list.length > 1 ? `${si + 1}.${k + 1}` : String(si + 1)))));
    pieces.push(routeFooter(r, couriers === 1));
  });
  if (couriers === 2 && plan.routes.length === 1) pieces.splice(1, 0, '🛵 <b>Курьер 1</b>' + `\n${totals(plan.routes[0].stops.flatMap((s) => mergeSameClient(s.items)), plan.routes[0].stops.length)}`);
  if (plan.noPoint.length) {
    pieces.push(`⚠️ <b>Без точки на карте — распределить/проверить вручную</b> (${plan.noPoint.length})`);
    plan.noPoint.forEach((d, i) => pieces.push(entry(d, String(i + 1))));
  }
  return pack(pieces);
}
