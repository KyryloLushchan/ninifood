import { adminDb } from './client';
import { clientKey, computeDayPay, parsePaySettings, type CourierDayPay, type PayRow, type PaySettings } from './courier-pay';
import { parseTripSettings, type RouteOverride } from './trips';

const KEYS = ['kitchen_lat', 'kitchen_lng', 'couriers_count', 'trip_capacity', 'courier_speed_kmh', 'stop_minutes', 'road_factor', 'depart_time', 'deadline_time', 'trip_gap_min', 'courier_pay_per_address', 'courier_fuel_l100', 'courier_fuel_price', 'courier_pay_from'];

export interface PayrollData {
  days: CourierDayPay[];
  pay: PaySettings;
  /** Ручные правки и выплаты по (дата, курьер) — для редактирования. */
  rows: PayRow[];
}

/** ЗП курьера по датам (та же логика, что у недельного отчёта на сервере): платим за подтверждённые и доставленные заказы. Нет кухни — null. */
export async function loadPayrollRange(datesIn: string[]): Promise<PayrollData | null> {
  if (!datesIn.length) return { days: [], pay: parsePaySettings({}), rows: [] };
  const { data: st } = await adminDb.from('settings').select('key, value').in('key', KEYS);
  const cfg = Object.fromEntries((st ?? []).map((r) => [r.key, r.value as string]));
  const klat = Number(cfg.kitchen_lat);
  const klng = Number(cfg.kitchen_lng);
  const pay = parsePaySettings(cfg);
  const dates = datesIn.filter((d) => d >= pay.from); // дни раньше «Учитывать ЗП с даты» не считаются
  if (!dates.length) return { days: [], pay, rows: [] };
  const { data: payRows } = await adminDb.from('courier_pay_days').select('date, courier, addresses_manual, km_manual, paid_at, paid_addresses, paid_km, paid_amount').in('date', dates);
  const rows = (payRows ?? []) as PayRow[];
  if (!cfg.kitchen_lat || !cfg.kitchen_lng || !Number.isFinite(klat) || !Number.isFinite(klng)) return null;
  const trip = parseTripSettings(cfg);
  const def: 1 | 2 = cfg.couriers_count === '2' ? 2 : 1;
  const days: CourierDayPay[] = [];
  const PAGE = 1000;
  const all: { delivery_date: string; qty: number; orders: { status: string; telegram: string; address: string; lat: number | null; lng: number | null } }[] = [];
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await adminDb
      .from('order_days')
      .select('delivery_date, qty, orders!inner(status, telegram, address, lat, lng)')
      .in('delivery_date', dates)
      .in('orders.status', ['confirmed', 'delivered'])
      .order('id')
      .range(i, i + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as unknown as typeof all));
    if (!data || data.length < PAGE) break;
  }
  const { data: ovs } = await adminDb.from('route_overrides').select('date, couriers, assign').in('date', dates);
  for (const date of dates) {
    const items = all.filter((r) => r.delivery_date === date).map((r) => ({ qty: r.qty, telegram: r.orders.telegram, address: r.orders.address, lat: r.orders.lat, lng: r.orders.lng }));
    if (!items.length) continue;
    const ov = (ovs ?? []).find((o) => o.date === date);
    const override: RouteOverride | null = ov ? { couriers: ov.couriers === 2 ? 2 : 1, assign: (ov.assign ?? {}) as RouteOverride['assign'] } : null;
    days.push(
      ...computeDayPay(date, items, { lat: (r) => r.lat, lng: (r) => r.lng, address: (r) => r.address, qty: (r) => r.qty }, (r) => clientKey(r.telegram), { lat: klat, lng: klng }, override?.couriers ?? def, trip, override, pay, rows),
    );
  }
  return { days, pay, rows };
}
