// Данные и план дня для ночных сообщений (отчёт курьеру, порции кухне, маршрут в группу курьера): один источник, чтобы все три считали одно и то же.
import type { ReportDelivery } from './courier-report.ts';
import { parseTripSettings, type RouteOverride, type TripSettings } from './trips.ts';
import type { LatLng } from './route.ts';

const SETTING_KEYS = ['kitchen_lat', 'kitchen_lng', 'couriers_count', 'trip_capacity', 'courier_speed_kmh', 'stop_minutes', 'road_factor', 'depart_time', 'deadline_time', 'trip_gap_min', 'courier_finish_lat', 'courier_finish_lng', 'courier_finish_radius_km', 'trip_nobox_portions', 'trip_box_threshold'];

/** Заказы new (⏳) + confirmed + delivered на дату (отменённые не считаются; delivered остаются в плане, чтобы рейсы не «плыли» в течение дня). */
export async function loadDayRows(db: any, date: string): Promise<{ error: string | null; rows: any[] }> {
  const { data, error } = await db
    .from('order_days')
    .select('id, qty, delivered, courier_marked_at, orders!inner(id, order_number, type, status, taxi, telegram, phone, address, place_id, lat, lng, hotel, comment, payment_method, total, cutlery, lang, order_days(delivery_date, delivered))')
    .eq('delivery_date', date)
    .in('orders.status', ['new', 'confirmed', 'delivered']);
  if (error) return { error: error.message as string, rows: [] };
  return { error: null, rows: (data ?? []) as any[] };
}

export interface DayPlanInput {
  kitchen: LatLng | null;
  couriers: 1 | 2;
  trip: TripSettings;
  override: RouteOverride | null;
  deliveries: ReportDelivery[];
}

/** Настройки рейсов, кухня, число курьеров (couriersOverride — на конкретный день), ручное распределение дня и доставки для отчёта. */
export async function loadDayPlan(db: any, date: string, rows: any[], couriersOverride: 1 | 2 | null = null): Promise<DayPlanInput> {
  const { data: st } = await db.from('settings').select('key, value').in('key', SETTING_KEYS);
  const cfg = Object.fromEntries((st ?? []).map((r: any) => [r.key, r.value]));
  const klat = Number(cfg.kitchen_lat);
  const klng = Number(cfg.kitchen_lng);
  const kitchen = cfg.kitchen_lat && cfg.kitchen_lng && Number.isFinite(klat) && Number.isFinite(klng) ? { lat: klat, lng: klng } : null;
  const couriers: 1 | 2 = couriersOverride ?? (cfg.couriers_count === '2' ? 2 : 1);
  const trip = parseTripSettings(cfg);
  const { data: ov } = await db.from('route_overrides').select('couriers, assign').eq('date', date).maybeSingle();
  const override: RouteOverride | null = ov ? { couriers: ov.couriers === 2 ? 2 : 1, assign: ov.assign ?? {} } : null;
  const deliveries: ReportDelivery[] = rows.map((r: any) => {
    const o = r.orders;
    const sortedDays = [...o.order_days].sort((a: any, b: any) => String(a.delivery_date).localeCompare(String(b.delivery_date)));
    const all: string[] = sortedDays.map((d: any) => d.delivery_date);
    // наличные не получены, пока первый день заказа не отмечен «Доставлено» админом
    const cashPending = o.payment_method === 'cash' && !sortedDays[0]?.delivered;
    return {
      order_number: o.order_number,
      telegram: o.telegram,
      phone: o.phone,
      address: o.address,
      place_id: o.place_id,
      lat: o.lat,
      lng: o.lng,
      hotel: o.hotel,
      comment: o.comment,
      payment_method: o.payment_method,
      total: o.total,
      cutlery: o.cutlery === true,
      qty: r.qty,
      status: r.delivered || o.status === 'delivered' ? 'delivered' : o.status === 'new' ? 'new' : 'confirmed',
      sub: o.type === 'subscription' ? { total: all.length, dayNo: all.indexOf(date) + 1 } : null,
      firstDay: all[0] === date,
      cashPending,
      cashSince: cashPending && all[0] !== date ? all[0] : null,
      dayIds: r.id != null ? [Number(r.id)] : [],
      markedAt: r.courier_marked_at ?? null,
      lang: o.lang ?? null,
      taxi: o.taxi === true,
    } as ReportDelivery;
  });
  return { kitchen, couriers, trip, override, deliveries };
}
