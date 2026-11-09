import { esc } from './telegram.ts';
import { labelRu } from './dates.ts';
import { mapLinkHtml, mapUrl, money, phoneText, subLabel } from './order-text.ts';
import type { LatLng } from './route.ts';
import { hhmm, lateWarning, planDay, type CourierTrips, type RouteOverride, type TripSettings } from './trips.ts';

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
  /** Статус заказа: new — не подтверждён (⏳), delivered — уже доставлен. По умолчанию confirmed. */
  status?: 'new' | 'confirmed' | 'delivered';
  /** Объединённая запись (несколько заказов одного клиента на один адрес): сумма наличных и пометки по подпискам. */
  cashOverride?: number;
  subNotes?: string[];
  /** id строк order_days (для кнопки «Доставлено» курьера) и время отметки курьера. */
  dayIds?: number[];
  markedAt?: string | null;
  /** Наличные по заказу ещё НЕ получены: заказ наличный, а первый день доставки не отмечен «Доставлено» админом. Нет поля — как раньше (наличные только в первый день). */
  cashPending?: boolean;
  /** Первый день заказа (ISO), если сегодня не он, а наличные всё ещё не получены — «(не оплачено с ДД.ММ)». */
  cashSince?: string | null;
  /** Язык заказа (ru/ua/en/vi) — сообщения клиенту из группы курьера идут на нём. */
  lang?: string | null;
  /** Флаг заказа «Такси»: не участвует в рейсах, ссылках и км, показывается отдельным блоком. */
  taxi?: boolean;
}

const TG_LIMIT = 4096;
const SAFE = 3900; // запас под заголовок и теги

export const handle = (raw: string) => {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `@${h}` : raw.trim();
};

export const portions = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'порция' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'порции' : 'порций';
  return `${n} ${w}`;
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
/** Наличные по заказу ещё не получены (первый день не отмечен «Доставлено»). */
export const cashPendingOf = (d: ReportDelivery) => d.cashPending ?? (d.payment_method === 'cash' && d.firstDay);
/**
 * Строка оплаты точки. Наличные берём, пока первый день заказа не отмечен «Доставлено» (деньги не получены): в первый день — «💵 Взять наличными: N ₫»,
 * в следующие дни, если первый так и не отмечен, — «💵 Взять наличными: N ₫ (не оплачено с ДД.ММ)». После отметки первого дня — «✅ Оплачено».
 */
export const paidLine = (d: ReportDelivery, due: number, money: (n: number) => string) => (due ? `💵 Взять наличными: <b>${money(due)}</b>${d.cashSince ? ` (не оплачено с ${ddmm(d.cashSince)})` : ''}` : '✅ Оплачено');

export const cashDue = (d: ReportDelivery) => (d.status === 'delivered' ? 0 : d.cashOverride ?? (cashPendingOf(d) ? d.total : 0));

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
      status: g.some((d) => d.status === 'new') ? ('new' as const) : g.every((d) => d.status === 'delivered') ? ('delivered' as const) : ('confirmed' as const),
      hotel: hotels.length ? hotels.join(' / ') : null,
      comment: comments.length ? comments.join(' / ') : null,
      phone: g.find((d) => d.phone)?.phone ?? null,
      cashOverride: g.reduce((n, d) => n + cashDue(d), 0),
      subNotes: g.filter((d) => d.sub).map((d) => `${d.order_number}: день ${d.sub!.dayNo} из ${d.sub!.total}`),
      sub: null,
      dayIds: g.flatMap((d) => d.dayIds ?? []),
      markedAt: g.every((d) => d.markedAt) ? (g[0].markedAt ?? null) : null,
      cashPending: g.some((d) => cashPendingOf(d)),
      cashSince: g.map((d) => (cashDue(d) > 0 ? d.cashSince : null)).filter(Boolean).sort()[0] ?? null,
      lang: g.find((d) => d.lang)?.lang ?? null,
    };
  });
}

/** Доставка «Такси» (клиенту заказ отправляют такси): «🚕 Такси: @ник · адрес (ссылка на карту) · порции · оплата/наличные · телефон»; в рейсах, ссылках и км не участвует. */
export const taxiLine = (d: ReportDelivery) => {
  const url = mapUrl(d.lat, d.lng, d.place_id);
  const addr = esc(d.address);
  return [
    `🚕 <b>Такси:</b> ${esc(handle(d.telegram))}`,
    url ? `<a href="${hrefAmp(url)}">${addr}</a>` : addr,
    portions(d.qty),
    d.status === 'delivered' ? '✅ Доставлено' : paidLine(d, cashDue(d), money),
    ...(d.phone ? [`📞 ${esc(phoneText(d.phone))}`] : []),
  ].join(' · ');
};

function entry(d: ReportDelivery, label: string, eta?: number): string {
  const due = cashDue(d);
  const lines = [`<b>${label}. ${esc(d.order_number)}</b> · ${esc(handle(d.telegram))}${eta != null ? ` · 🕒 ≈ ${hhmm(eta)}` : ''}`];
  if (d.status === 'new') lines.push('⏳ <b>Не подтверждён</b>');
  lines.push(`📍 <code>${esc(d.address)}</code>`);
  const map = mapLinkHtml(d.lat, d.lng, d.place_id);
  if (map) lines.push(map);
  if (d.hotel) lines.push(`🏨 ${esc(d.hotel)}`);
  if (d.phone) lines.push(`📞 ${esc(phoneText(d.phone))}`);
  if (d.sub) lines.push(`🔁 ${subLabel(d.sub.total)} · день ${d.sub.dayNo} из ${d.sub.total}`);
  if (d.subNotes?.length) lines.push(`🔁 ${d.subNotes.map(esc).join(' · ')}`);
  lines.push(`🍽 <b>${portions(d.qty).toUpperCase()}</b>`);
  if (d.cutlery) lines.push('🍴 <b>ПРИБОРЫ: ДА</b>');
  lines.push(d.status === 'delivered' ? '✅ Доставлено' : paidLine(d, due, money));
  if (d.comment) lines.push(`💬 ${esc(d.comment)}`);
  return lines.join('\n');
}

export const kmText = (km: number) => `≈ ${Math.round(km)} км`;
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

export const hrefAmp = (u: string) => u.replace(/&/g, '&amp;');

/** Ссылки Google Maps рейса (по частям, если точек больше лимита ссылки): замкнутый — до кухни, открытый — до последней точки. */
export const tripLinks = (t: CourierTrips<ReportDelivery>['trips'][number]) =>
  `🗺 ${t.links.length === 1 ? `<a href="${hrefAmp(t.links[0])}">Открыть в Google Maps</a>` : t.links.map((u, i) => `<a href="${hrefAmp(u)}">Часть ${i + 1}/${t.links.length}</a>`).join(' · ')} (${t.closed ? 'кухня → … → кухня' : t.toFinish ? 'кухня → … → 🏠 Финиш' : 'кухня → … → последняя точка'})${t.toFinish ? `\n🏠 Финиш: ≈ ${(Math.round(t.finishKm * 10) / 10).toString().replace('.', ',')} км от последней точки (в ЗП не входит)` : ''}`;

/** Блок курьера: предупреждение, рейсы («🚚 Рейс N — порц. · км · время»), точки со сквозной нумерацией и временем, ссылки рейса в его конце. */
function courierBlock(cr: CourierTrips<ReportDelivery>, couriers: 1 | 2, index: number): string[] {
  const block: string[] = [];
  const all = cr.trips.flatMap((t) => t.stops.flatMap((s) => mergeSameClient(s.stop.items)));
  if (couriers === 2) block.push(`🛵 <b>Курьер ${index + 1}</b>\n${totals(all, cr.trips.reduce((n, t) => n + t.stops.length, 0))} · ${kmText(cr.totalKm)}`);
  const warn = lateWarning(cr, couriers, index);
  if (warn) block.push(warn);
  let no = 0;
  cr.trips.forEach((t, ti) => {
    // заголовок рейса идёт одним куском с первой точкой — при разбиении на сообщения они не разъезжаются
    let title: string | null = `🚚 <b>Рейс ${ti + 1}</b> — ${t.portions} порц. · ${kmText(t.km)} · ${hhmm(t.startMin)}–${hhmm(t.endMin)}${t.overCapacity ? ' 🔴 больше вместимости' : ''}${t.box ? (t.box === 'box' ? ' · 📦 с ящиком' : ' · 🎒 без ящика') : ''}`;
    t.stops.forEach((s) => {
      no++;
      const list = mergeSameClient(s.stop.items);
      list.forEach((d, k) => {
        const e = entry(d, list.length > 1 ? `${no}.${k + 1}` : String(no), s.arriveMin);
        block.push(title ? `${title}\n\n${e}` : e);
        title = null;
      });
    });
    block.push(tripLinks(t));
  });
  return block;
}

/**
 * Текст(ы) отчёта на дату; при длине > 4096 режется по границам записей.
 * Есть координаты кухни — рейсы по вместимости (`planDay`): у каждого курьера свой блок (при 2 курьерах — с нового сообщения), рейсы со временем и ссылками;
 * неподтверждённые помечены ⏳; доставки без координат — отдельный блок. Нет кухни — как раньше, по номеру заказа.
 */
export function buildCourierReport(
  date: string,
  deliveries: ReportDelivery[],
  from: string,
  to: string,
  opts?: { kitchen: LatLng | null; couriers: 1 | 2; trip?: TripSettings; override?: RouteOverride | null },
): string[] {
  const label = labelRu(date);
  if (deliveries.length === 0) return [`На ${label} доставок нет`];
  const couriers = opts?.couriers ?? 1;
  const kitchen = opts?.kitchen ?? null;
  const byNumber = (a: ReportDelivery, b: ReportDelivery) => a.order_number.localeCompare(b.order_number);

  if (!kitchen || !opts?.trip) {
    const list = [...deliveries].filter((d) => !d.taxi).sort(byNumber);
    const off = mergeSameClient([...deliveries].filter((d) => d.taxi).sort(byNumber));
    return pack([[`📦 <b>Доставки на ${label} — ${from}–${to}</b>`, totals(list, list.length)].join('\n'), ...list.map((d, i) => entry(d, String(i + 1))), ...off.map(taxiLine)]);
  }

  const plan = planDay([...deliveries].sort(byNumber), { lat: (d) => d.lat, lng: (d) => d.lng, address: (d) => d.address, qty: (d) => d.qty, taxi: (d) => d.taxi === true }, kitchen, couriers, opts.trip, opts.override);
  const stopsTotal = plan.couriers.reduce((s, c) => s + c.trips.reduce((n, t) => n + t.stops.length, 0), 0) + plan.noPoint.length;
  const placed = plan.couriers.flatMap((c) => c.trips.flatMap((t) => t.stops.flatMap((s) => mergeSameClient(s.stop.items)))).concat(plan.noPoint);
  const tripsTotal = plan.couriers.reduce((n, c) => n + c.trips.length, 0);
  const header = [`📦 <b>Доставки на ${label} — ${from}–${to}</b>`, `${totals(placed, stopsTotal)} · Рейсов: ${tripsTotal}${plan.manual ? ' · ручное распределение' : ''}`].join('\n');
  const blocks = plan.couriers.map((c, i) => courierBlock(c, couriers, i));
  if (couriers === 2 && blocks.length === 1) blocks[0].unshift('🛵 <b>Курьер 1</b>');
  if (plan.noPoint.length) {
    blocks.push([`⚠️ <b>Без точки на карте — распределить/проверить вручную</b> (${plan.noPoint.length})`, ...plan.noPoint.map((d, i) => entry(d, String(i + 1)))]);
  }
  // «Такси» — отдельным блоком в конце отчёта (в рейсы, ссылки и км не входит)
  if (plan.taxi.length) blocks.push(mergeSameClient(plan.taxi).map(taxiLine));
  // Блоки курьеров: при 2 курьерах каждый начинается с нового сообщения, чтобы его можно было переслать целиком.
  if (couriers === 2) return [header, ...blocks.flatMap((b) => pack(b))];
  return pack([header, ...blocks.flat()]);
}
