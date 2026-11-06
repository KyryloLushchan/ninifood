// ЗП курьера: чистые функции (без сети и БД).
// ВАЖНО: файл дублируется в src/lib/admin/courier-pay.ts (админка) — править оба одинаково (сверка: diff, различается только строка импорта).
import type { Access, LatLng } from './route.ts';
import { planDay, stopKey, type RouteOverride, type TripSettings } from './trips.ts';

export interface PaySettings {
  /** Оплата за адрес, ₫. */
  perAddress: number;
  /** Расход, л/100 км. */
  fuelPer100: number;
  /** Цена бензина, ₫/л (статичная, правится вручную в настройках). */
  fuelPrice: number;
  /** Учитывать ЗП с этой даты (включительно, ISO): курьер работает с 02.11.2026, дни раньше в расчёт и отчёт не входят. */
  from: string;
  /** Обед курьера, ₫ за каждый рабочий день (был хотя бы один адрес): вычитается из ЗП дня, с даты lunchFrom. */
  lunch: number;
  lunchFrom: string;
}
export const DEFAULT_PAY: PaySettings = { perAddress: 20_000, fuelPer100: 2.2, fuelPrice: 26_000, from: '2026-11-02', lunch: 50_000, lunchFrom: '2026-11-05' };

const num = (v: string | undefined, d: number, min: number, max: number) => {
  if (v === undefined || v.trim() === '') return d; // нет значения — по умолчанию (а не 0)
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : d;
};

/** Ключи settings: courier_pay_per_address, courier_fuel_l100, courier_fuel_price, courier_pay_from. */
export function parsePaySettings(s: Record<string, string | undefined>): PaySettings {
  return {
    perAddress: Math.round(num(s.courier_pay_per_address, DEFAULT_PAY.perAddress, 0, 1_000_000)),
    fuelPer100: num(s.courier_fuel_l100, DEFAULT_PAY.fuelPer100, 0, 50),
    fuelPrice: Math.round(num(s.courier_fuel_price, DEFAULT_PAY.fuelPrice, 0, 200_000)),
    from: /^\d{4}-\d{2}-\d{2}$/.test((s.courier_pay_from ?? '').trim()) ? s.courier_pay_from!.trim() : DEFAULT_PAY.from,
    lunch: Math.round(num(s.courier_lunch, DEFAULT_PAY.lunch, 0, 1_000_000)),
    lunchFrom: /^\d{4}-\d{2}-\d{2}$/.test((s.courier_lunch_from ?? '').trim()) ? s.courier_lunch_from!.trim() : DEFAULT_PAY.lunchFrom,
  };
}

/** Округление до 500 ₫ (к ближайшему). */
export const round500 = (n: number) => Math.round(n / 500) * 500;
/** Километры — с точностью до 0,1 (как вводит админ по спидометру). */
export const roundKm = (km: number) => Math.round(km * 10) / 10;
/** Бензин = км × л/100 км / 100 × цена, округлён до 500 ₫. */
export const fuelCost = (km: number, s: PaySettings) => round500(((roundKm(km) * s.fuelPer100) / 100) * s.fuelPrice);

/** Ручная правка (до выплаты) и статус выплаты по дню и курьеру — строка courier_pay_days. */
export interface PayRow {
  date: string;
  courier: number;
  addresses_manual: number | null;
  km_manual: number | null;
  paid_at: string | null;
  paid_addresses: number | null;
  paid_km: number | null;
  paid_amount: number | null;
  /** Админ убрал вычет обеда на этот день. */
  lunch_skip?: boolean | null;
  /** Снимок расчёта дня (фиксируется в 23:30): адреса/км по плану и ставки на тот день — день дальше не пересчитывается при смене настроек. */
  snap_at?: string | null;
  snap_source?: string | null;
  snap_addresses?: number | null;
  snap_km?: number | string | null;
  snap_per_address?: number | null;
  snap_fuel_l100?: number | string | null;
  snap_fuel_price?: number | null;
  snap_lunch?: number | null;
}

export interface CourierDayPay {
  date: string;
  courier: number;
  /** Адреса и км как посчитал планировщик (без ручных правок). */
  autoAddresses: number;
  autoKm: number;
  /** Итоговые (с ручными правками; у выплаченных — зафиксированные при выплате). */
  addresses: number;
  km: number;
  fuel: number;
  total: number;
  manual: boolean;
  paid: boolean;
  /** Вычет обеда, применённый к дню (0 — не вычитаем), и признак «вычет убран админом». */
  lunch: number;
  lunchSkip: boolean;
  /** День зафиксирован снимком (не пересчитывается при смене настроек); время фиксации. */
  snapshot: boolean;
  snapAt: string | null;
}

/** Клиент по нику Telegram (регистр и @ не важны). */
export const clientKey = (telegram: string) =>
  telegram.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '').toLowerCase();

/**
 * Адреса курьера: каждый клиент в каждой точке = 1 адрес. Разные клиенты на одном адресе — разные адреса;
 * несколько заказов ОДНОГО клиента на одном адресе — один адрес.
 */
export function countAddresses<T>(stops: { stop: { items: T[]; lat: number; lng: number } }[], client: (t: T) => string): number {
  const seen = new Set<string>();
  for (const s of stops) for (const it of s.stop.items) seen.add(`${stopKey(s.stop)}|${client(it)}`);
  return seen.size;
}

/**
 * ЗП курьеров за день. items — доставки дня, за которые платим (подтверждённые и доставленные; новые/отменённые не входят).
 * Адреса и км — по тому же плану рейсов, что в отчёте (`planDay`, с ручным распределением); км включают возвраты на кухню между рейсами; отрезок «последний заказ → финиш (дом)» в км не входит
 * (последний рейс — без возврата). rows — ручные правки и выплаты по (дата, курьер).
 */
export function computeDayPay<T>(
  date: string,
  items: T[],
  a: Access<T>,
  client: (t: T) => string,
  kitchen: LatLng,
  couriers: 1 | 2,
  trip: TripSettings,
  override: RouteOverride | null | undefined,
  pay: PaySettings,
  rows: PayRow[] = [],
): CourierDayPay[] {
  const plan = planDay(items, a, kitchen, couriers, trip, override);
  const out: CourierDayPay[] = [];
  // дни со снимком показываются даже если плана уже нет (например, заказы потом отменили)
  const snapCouriers = rows.filter((r) => r.date === date && r.snap_at).map((r) => r.courier);
  const n = Math.max(plan.couriers.length, ...snapCouriers, 0);
  for (let courier = 1; courier <= n; courier++) {
    const cr = plan.couriers[courier - 1];
    const row = rows.find((r) => r.date === date && r.courier === courier);
    const snap = row?.snap_at ? row : null;
    if (!cr && !snap) continue;
    // со снимком: адреса и км «как посчитано в тот день», ставки — те, что действовали тогда
    const p: PaySettings = snap
      ? {
          ...pay,
          perAddress: snap.snap_per_address ?? pay.perAddress,
          fuelPer100: snap.snap_fuel_l100 != null ? Number(snap.snap_fuel_l100) : pay.fuelPer100,
          fuelPrice: snap.snap_fuel_price ?? pay.fuelPrice,
          lunch: snap.snap_lunch ?? 0,
          lunchFrom: '0000-00-00',
        }
      : pay;
    const autoAddresses = snap && snap.snap_addresses != null ? snap.snap_addresses : countAddresses(cr!.trips.flatMap((t) => t.stops), client);
    const autoKm = snap && snap.snap_km != null ? roundKm(Number(snap.snap_km)) : roundKm(cr!.totalKm);
    const paid = !!row?.paid_at;
    const addresses = paid ? (row!.paid_addresses ?? autoAddresses) : (row?.addresses_manual ?? autoAddresses);
    const km = paid ? Number(row!.paid_km ?? autoKm) : Number(row?.km_manual ?? autoKm);
    const fuel = fuelCost(km, p);
    const base = addresses * p.perAddress + fuel;
    const lunchSkip = !!row?.lunch_skip;
    // обед вычитается за каждый день, когда курьер работал (есть доставки), с lunchFrom; у выплаченного дня вычет восстанавливается из выплаченной суммы
    const lunch = paid && row!.paid_amount != null ? Math.max(0, base - Number(row!.paid_amount)) : date >= p.lunchFrom && p.lunch > 0 && !lunchSkip ? p.lunch : 0;
    const total = paid && row!.paid_amount != null ? Number(row!.paid_amount) : base - lunch;
    out.push({ date, courier, autoAddresses, autoKm, addresses, km, fuel, total, manual: !paid && (row?.addresses_manual != null || row?.km_manual != null), paid, lunch, lunchSkip, snapshot: !!snap, snapAt: snap?.snap_at ?? null });
  }
  return out;
}

export const fmtRub = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₫`;
const kmTxt = (km: number) => `${(Math.round(km * 10) / 10).toString().replace('.', ',')} км`;

/** «12 адресов × 20 000 + бензин 27 км = 255 500 ₫» */
export function payLine(p: { addresses: number; km: number; total: number; lunch?: number }, s: PaySettings): string {
  return `${p.addresses} ${plural(p.addresses)} × ${fmtRub(s.perAddress)} + бензин ${kmTxt(p.km)}${p.lunch ? ` − обед ${fmtRub(p.lunch)}` : ''} = ${fmtRub(p.total)}`;
}
const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'адрес' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'адреса' : 'адресов');

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const wdOf = (iso: string) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Текст недельного отчёта по ЗП (HTML для Telegram). unpaid — сумма к выплате (выплаченные дни показываются, но в сумму не входят). */
export function buildPayrollReport(weekStart: string, weekEnd: string, days: CourierDayPay[], s: PaySettings): { text: string; total: number } {
  const couriers = [...new Set(days.map((d) => d.courier))].sort();
  const lines = [`🛵 <b>ЗП курьера за ${dm(weekStart)}–${dm(weekEnd)}</b>`];
  let total = 0;
  for (const c of couriers) {
    const mine = days.filter((d) => d.courier === c).sort((a, b) => a.date.localeCompare(b.date));
    lines.push('', couriers.length > 1 ? `<b>Курьер ${c}</b>` : '');
    let sum = 0;
    for (const d of mine) {
      lines.push(`${wdOf(d.date)} ${dm(d.date)} — ${d.addresses} адр. · ${kmTxt(d.km)} · ${fmtRub(d.total)}${d.paid ? ' ✅ выплачено' : d.manual ? ' ✏️' : ''}${!d.paid && d.lunchSkip && d.date >= s.lunchFrom ? ' (без вычета обеда)' : ''}`);
      if (!d.paid) sum += d.total;
    }
    if (couriers.length > 1) lines.push(`Итого курьер ${c}: ${fmtRub(sum)}`);
    total += sum;
  }
  const lunchDays = days.filter((d) => !d.paid && d.lunch > 0);
  if (lunchDays.length) lines.push('', `🍲 Обеды: −${fmtRub(lunchDays[0].lunch)} × ${lunchDays.length} дн.`);
  lines.push('', `💰 <b>К выплате: ${fmtRub(total)}</b>`);
  return { text: lines.filter((l, i, a) => !(l === '' && (a[i - 1] === '' || i === 0))).join('\n'), total };
}

/** Дни недели Пн–Сб (ISO) по понедельнику недели. */
export function weekDays(monday: string): string[] {
  const d = new Date(`${monday}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}
