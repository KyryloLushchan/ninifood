// ЗП курьера: чистые функции (без сети и БД).
// ВАЖНО: файл дублируется в src/lib/admin/courier-pay.ts (админка) — править оба одинаково (сверка: diff, различается только строка импорта).
import type { Access, LatLng } from './route';
import { planDay, stopKey, type RouteOverride, type TripSettings } from './trips';

export interface PaySettings {
  /** Оплата за адрес, ₫. */
  perAddress: number;
  /** Расход, л/100 км. */
  fuelPer100: number;
  /** Цена бензина, ₫/л (статичная, правится вручную в настройках). */
  fuelPrice: number;
}
export const DEFAULT_PAY: PaySettings = { perAddress: 20_000, fuelPer100: 2.2, fuelPrice: 26_000 };

const num = (v: string | undefined, d: number, min: number, max: number) => {
  if (v === undefined || v.trim() === '') return d; // нет значения — по умолчанию (а не 0)
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : d;
};

/** Ключи settings: courier_pay_per_address, courier_fuel_l100, courier_fuel_price. */
export function parsePaySettings(s: Record<string, string | undefined>): PaySettings {
  return {
    perAddress: Math.round(num(s.courier_pay_per_address, DEFAULT_PAY.perAddress, 0, 1_000_000)),
    fuelPer100: num(s.courier_fuel_l100, DEFAULT_PAY.fuelPer100, 0, 50),
    fuelPrice: Math.round(num(s.courier_fuel_price, DEFAULT_PAY.fuelPrice, 0, 200_000)),
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
 * Адреса и км — по тому же плану рейсов, что в отчёте (`planDay`, с ручным распределением); км включают возвраты на кухню между рейсами
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
  plan.couriers.forEach((cr, i) => {
    const courier = i + 1;
    const autoAddresses = countAddresses(
      cr.trips.flatMap((t) => t.stops),
      client,
    );
    const autoKm = roundKm(cr.totalKm);
    const row = rows.find((r) => r.date === date && r.courier === courier);
    const paid = !!row?.paid_at;
    const addresses = paid ? (row!.paid_addresses ?? autoAddresses) : (row?.addresses_manual ?? autoAddresses);
    const km = paid ? Number(row!.paid_km ?? autoKm) : Number(row?.km_manual ?? autoKm);
    const fuel = fuelCost(km, pay);
    const total = paid && row!.paid_amount != null ? Number(row!.paid_amount) : addresses * pay.perAddress + fuel;
    out.push({ date, courier, autoAddresses, autoKm, addresses, km, fuel, total, manual: !paid && (row?.addresses_manual != null || row?.km_manual != null), paid });
  });
  return out;
}

export const fmtRub = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₫`;
const kmTxt = (km: number) => `${(Math.round(km * 10) / 10).toString().replace('.', ',')} км`;

/** «12 адресов × 20 000 + бензин 27 км = 255 500 ₫» */
export function payLine(p: { addresses: number; km: number; total: number }, s: PaySettings): string {
  return `${p.addresses} ${plural(p.addresses)} × ${fmtRub(s.perAddress)} + бензин ${kmTxt(p.km)} = ${fmtRub(p.total)}`;
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
      lines.push(`${wdOf(d.date)} ${dm(d.date)} — ${d.addresses} адр. · ${kmTxt(d.km)} · ${fmtRub(d.total)}${d.paid ? ' ✅ выплачено' : d.manual ? ' ✏️' : ''}`);
      if (!d.paid) sum += d.total;
    }
    if (couriers.length > 1) lines.push(`Итого курьер ${c}: ${fmtRub(sum)}`);
    total += sum;
  }
  lines.push('', `💰 <b>К выплате: ${fmtRub(total)}</b>`);
  return { text: lines.filter((l, i, a) => !(l === '' && (a[i - 1] === '' || i === 0))).join('\n'), total };
}

/** Дни недели Пн–Сб (ISO) по понедельнику недели. */
export function weekDays(monday: string): string[] {
  const d = new Date(`${monday}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}
