// Маршрут курьера: чистые функции без зависимостей и без платных сервисов.
// ВАЖНО: файл дублируется в src/lib/admin/route.ts (админка) — править оба одинаково (сверка: diff двух файлов).

export interface LatLng {
  lat: number;
  lng: number;
}

/** Коэффициент «прямая → дорога» для оценки длины по Дананг-улицам. */
export const ROAD_FACTOR = 1.3;
/** Точек (остановок) в одной ссылке Google Maps: origin + до 8 промежуточных + destination. */
export const LINK_STOPS = 9;
/** Длиннее — предупреждение «подумай о 2 курьерах». */
export const LONG_ROUTE_KM = 35;

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Расстояние по дорогам (оценка), км: haversine × 1.3. */
export function roadKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
}

export interface Stop<T> extends LatLng {
  items: T[];
  portions: number;
}

export interface Route<T> {
  stops: Stop<T>[];
  km: number;
  /** Ссылки Google Maps Directions (больше LINK_STOPS остановок — несколько, следующая начинается с последней точки предыдущей). */
  links: string[];
}

export interface Plan<T> {
  routes: Route<T>[];
  /** Доставки без координат — распределить вручную. */
  noPoint: T[];
}

export interface Access<T> {
  lat: (t: T) => number | null | undefined;
  lng: (t: T) => number | null | undefined;
  address: (t: T) => string;
  qty: (t: T) => number;
}

const normAddr = (s: string) => s.toLowerCase().replace(/[\s,.;]+/g, ' ').trim();

/** Одинаковые координаты (до ~1 м) или одинаковый адрес = одна остановка. Без координат — в noPoint. */
export function groupStops<T>(items: T[], a: Access<T>): { stops: Stop<T>[]; noPoint: T[] } {
  const byKey = new Map<string, Stop<T>>();
  const byAddr = new Map<string, Stop<T>>();
  const noPoint: T[] = [];
  for (const it of items) {
    const lat = a.lat(it);
    const lng = a.lng(it);
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      noPoint.push(it);
      continue;
    }
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const addr = normAddr(a.address(it));
    let s = byKey.get(key) ?? (addr ? byAddr.get(addr) : undefined);
    if (!s) {
      s = { lat, lng, items: [], portions: 0 };
      byKey.set(key, s);
    }
    if (addr && !byAddr.has(addr)) byAddr.set(addr, s);
    s.items.push(it);
    s.portions += a.qty(it);
  }
  return { stops: [...new Set(byKey.values())], noPoint };
}

const pathKm = (p: LatLng[]) => p.slice(1).reduce((s, q, i) => s + roadKm(p[i], q), 0);

/** Открытый маршрут от кухни: nearest neighbor + 2-opt (кухня зафиксирована, возврата нет). Возвращает порядок остановок. */
export function orderStops<T>(kitchen: LatLng, stops: Stop<T>[]): Stop<T>[] {
  if (stops.length < 2) return [...stops];
  const left = [...stops];
  let path: LatLng[] = [kitchen];
  const order: Stop<T>[] = [];
  while (left.length) {
    const cur = path[path.length - 1];
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (roadKm(cur, left[i]) < roadKm(cur, left[bi])) bi = i;
    const [s] = left.splice(bi, 1);
    order.push(s);
    path.push(s);
  }
  // 2-opt: разворот отрезка order[i..j]; хвост (j = последняя) разворачивается без «обратной» дуги.
  const n = order.length;
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    path = [kitchen, ...order];
    for (let i = 1; i <= n; i++) {
      for (let j = i + 1; j <= n; j++) {
        const before = roadKm(path[i - 1], path[i]) + (j < n ? roadKm(path[j], path[j + 1]) : 0);
        const after = roadKm(path[i - 1], path[j]) + (j < n ? roadKm(path[i], path[j + 1]) : 0);
        if (after + 1e-9 < before) {
          const seg = path.slice(i, j + 1).reverse();
          path.splice(i, j - i + 1, ...seg);
          order.splice(i - 1, j - i + 1, ...order.slice(i - 1, j).reverse());
          improved = true;
        }
      }
    }
  }
  return order;
}

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Ссылки Google Maps Directions: origin = кухня, waypoints по порядку, destination = последняя точка, travelmode=driving. */
export function directionsLinks(kitchen: LatLng, ordered: LatLng[]): string[] {
  const links: string[] = [];
  let origin = kitchen;
  for (let i = 0; i < ordered.length; i += LINK_STOPS) {
    const chunk = ordered.slice(i, i + LINK_STOPS);
    const dest = chunk[chunk.length - 1];
    const via = chunk.slice(0, -1);
    links.push(
      `https://www.google.com/maps/dir/?api=1&origin=${fmt(origin)}&destination=${fmt(dest)}${via.length ? `&waypoints=${via.map(fmt).join('%7C')}` : ''}&travelmode=driving`,
    );
    origin = dest;
  }
  return links;
}

function makeRoute<T>(kitchen: LatLng, stops: Stop<T>[]): Route<T> {
  const ordered = orderStops(kitchen, stops);
  return { stops: ordered, km: pathKm([kitchen, ...ordered]), links: directionsLinks(kitchen, ordered) };
}

/**
 * Два курьера: остановки сортируются по углу вокруг кухни (sweep); перебираются все циклические сдвиги
 * и размеры первой группы так, что число остановок различается не больше чем на 2; выбирается разбиение
 * с минимальной длиной самого длинного маршрута (+ небольшой штраф за разницу в порциях).
 */
function splitTwo<T>(kitchen: LatLng, stops: Stop<T>[]): [Stop<T>[], Stop<T>[]] {
  const n = stops.length;
  if (n < 2) return [stops, []];
  const k = Math.cos(rad(kitchen.lat));
  const sorted = [...stops].sort((p, q) => Math.atan2(p.lat - kitchen.lat, (p.lng - kitchen.lng) * k) - Math.atan2(q.lat - kitchen.lat, (q.lng - kitchen.lng) * k));
  const sizes = [...new Set([Math.floor(n / 2) - 1, Math.floor(n / 2), Math.ceil(n / 2), Math.ceil(n / 2) + 1])].filter((s) => s >= 1 && s <= n - 1 && Math.abs(n - 2 * s) <= 2);
  let best: { score: number; a: Stop<T>[]; b: Stop<T>[] } | null = null;
  for (let r = 0; r < n; r++) {
    const rot = [...sorted.slice(r), ...sorted.slice(0, r)];
    for (const s of sizes) {
      const a = rot.slice(0, s);
      const b = rot.slice(s);
      const ra = makeRoute(kitchen, a);
      const rb = makeRoute(kitchen, b);
      const pa = a.reduce((x, y) => x + y.portions, 0);
      const pb = b.reduce((x, y) => x + y.portions, 0);
      const score = Math.max(ra.km, rb.km) + 0.2 * Math.abs(pa - pb);
      if (!best || score < best.score) best = { score, a, b };
    }
  }
  return [best!.a, best!.b];
}

/** Полный план: остановки → 1 или 2 маршрута от кухни + доставки без точки. Курьер 1 — тот, чья первая остановка ближе к кухне. */
export function planRoutes<T>(items: T[], a: Access<T>, kitchen: LatLng, couriers: 1 | 2): Plan<T> {
  const { stops, noPoint } = groupStops(items, a);
  if (couriers === 1 || stops.length < 2) return { routes: stops.length ? [makeRoute(kitchen, stops)] : [], noPoint };
  const [x, y] = splitTwo(kitchen, stops);
  const routes = [makeRoute(kitchen, x), makeRoute(kitchen, y)];
  return { routes, noPoint };
}
