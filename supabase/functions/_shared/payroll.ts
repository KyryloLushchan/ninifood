// ЗП курьера: загрузка данных из БД и расчёт по датам (серверная часть; чистые функции — в courier-pay.ts).
import { clientKey, computeDayPay, parsePaySettings, type CourierDayPay, type PayRow, type PaySettings } from './courier-pay.ts';
import { parseTripSettings, type RouteOverride } from './trips.ts';

const KEYS = ['kitchen_lat', 'kitchen_lng', 'couriers_count', 'trip_capacity', 'courier_speed_kmh', 'stop_minutes', 'road_factor', 'depart_time', 'deadline_time', 'trip_gap_min', 'courier_finish_lat', 'courier_finish_lng', 'courier_finish_radius_km', 'trip_nobox_portions', 'trip_box_threshold', 'courier_pay_per_address', 'courier_fuel_l100', 'courier_fuel_price', 'courier_pay_from', 'courier_lunch', 'courier_lunch_from'];

export interface PayrollResult {
  days: CourierDayPay[];
  pay: PaySettings;
}

/** ЗП по датам: платим за подтверждённые и доставленные заказы (новые и отменённые не входят). Нет координат кухни — null. */
export async function loadPayroll(db: any, datesIn: string[], opts: { fresh?: boolean } = {}): Promise<PayrollResult | null> {
  const { data: st } = await db.from('settings').select('key, value').in('key', KEYS);
  const cfg = Object.fromEntries((st ?? []).map((r: any) => [r.key, r.value]));
  const klat = Number(cfg.kitchen_lat);
  const klng = Number(cfg.kitchen_lng);
  if (!cfg.kitchen_lat || !cfg.kitchen_lng || !Number.isFinite(klat) || !Number.isFinite(klng)) return null;
  const kitchen = { lat: klat, lng: klng };
  const trip = parseTripSettings(cfg);
  const pay = parsePaySettings(cfg);
  const defCouriers: 1 | 2 = cfg.couriers_count === '2' ? 2 : 1;
  const dates = datesIn.filter((d) => d >= pay.from); // дни раньше «Учитывать ЗП с даты» не считаются
  if (!dates.length) return { days: [], pay };

  const { data: rows, error } = await db
    .from('order_days')
    .select('delivery_date, qty, orders!inner(status, off_route, telegram, address, lat, lng)')
    .in('delivery_date', dates)
    .in('orders.status', ['confirmed', 'delivered']);
  if (error) throw new Error(error.message);
  const { data: ovs } = await db.from('route_overrides').select('date, couriers, assign').in('date', dates);
  const { data: payRows } = await db.from('courier_pay_days').select('date, courier, addresses_manual, km_manual, paid_at, paid_addresses, paid_km, paid_amount, lunch_skip, snap_at, snap_source, snap_addresses, snap_km, snap_per_address, snap_fuel_l100, snap_fuel_price, snap_lunch').in('date', dates);

  // fresh — расчёт «с нуля» по текущим настройкам, игнорируя снимки (нужен самому снимку, чтобы обновить предварительный)
  const pays: PayRow[] = ((payRows ?? []) as PayRow[]).map((r) => (opts.fresh ? { ...r, snap_at: null } : r));
  const days: CourierDayPay[] = [];
  for (const date of dates) {
    const items = (rows ?? []).filter((r: any) => r.delivery_date === date).map((r: any) => ({ qty: r.qty, telegram: r.orders.telegram, address: r.orders.address, lat: r.orders.lat, lng: r.orders.lng, offRoute: r.orders.off_route === true }));
    if (!items.length && !pays.some((r) => r.date === date && r.snap_at)) continue;
    const ov = (ovs ?? []).find((o: any) => o.date === date);
    const override: RouteOverride | null = ov ? { couriers: ov.couriers === 2 ? 2 : 1, assign: ov.assign ?? {} } : null;
    const couriers: 1 | 2 = override?.couriers ?? defCouriers;
    days.push(
      ...computeDayPay(date, items, { lat: (r) => r.lat, lng: (r) => r.lng, address: (r) => r.address, qty: (r) => r.qty, offRoute: (r) => r.offRoute }, (r) => clientKey(r.telegram), kitchen, couriers, trip, override, pay, pays),
    );
  }
  return { days, pay };
}
