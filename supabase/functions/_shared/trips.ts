// Рейсы курьера по вместимости: чистые функции без зависимостей и без платных сервисов (расстояние = по прямой × коэффициент).
// ВАЖНО: файл дублируется в src/lib/admin/trips.ts (админка) — править оба одинаково (сверка: diff, различается только строка импорта).
import { directionsLinks, groupStops, type Access, type LatLng, type Stop } from './route.ts';

export interface TripSettings {
  /** Порций за рейс. */
  capacity: number;
  speedKmh: number;
  /** Время на точку, мин. */
  stopMin: number;
  /** Коэффициент «прямая → дорога». */
  roadFactor: number;
  /** Выезд и конец окна, минут от 00:00. */
  departMin: number;
  deadlineMin: number;
  /** Пауза между рейсами (перезагрузка на кухне), мин. */
  gapMin: number;
}

export const DEFAULT_TRIP_SETTINGS: TripSettings = { capacity: 9, speedKmh: 25, stopMin: 4, roadFactor: 1.3, departMin: 13 * 60, deadlineMin: 16 * 60, gapMin: 10 };

const hm = (v: string | undefined, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? '').trim());
  return m ? +m[1] * 60 + +m[2] : d;
};
const num = (v: string | undefined, d: number, min: number, max: number) => {
  if (v === undefined || v.trim() === '') return d; // нет значения — по умолчанию (а не 0)
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : d;
};

/** Ключи settings: trip_capacity, courier_speed_kmh, stop_minutes, road_factor, depart_time, deadline_time, trip_gap_min. Неверные/пустые — значения по умолчанию. */
export function parseTripSettings(s: Record<string, string | undefined>): TripSettings {
  const d = DEFAULT_TRIP_SETTINGS;
  return {
    capacity: Math.round(num(s.trip_capacity, d.capacity, 1, 50)),
    speedKmh: num(s.courier_speed_kmh, d.speedKmh, 5, 80),
    stopMin: num(s.stop_minutes, d.stopMin, 0, 30),
    roadFactor: num(s.road_factor, d.roadFactor, 1, 3),
    departMin: hm(s.depart_time, d.departMin),
    deadlineMin: hm(s.deadline_time, d.deadlineMin),
    gapMin: num(s.trip_gap_min, d.gapMin, 0, 120),
  };
}

export const hhmm = (min: number) => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const stopKey = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

export interface TimedStop<T> {
  stop: Stop<T>;
  key: string;
  arriveMin: number;
}
export interface Trip<T> {
  stops: TimedStop<T>[];
  portions: number;
  km: number;
  startMin: number;
  endMin: number;
  /** true — кухня → точки → кухня (промежуточные рейсы); последний рейс (и единственный) — открытый, до последней точки. */
  closed: boolean;
  overCapacity: boolean;
  /** Ссылки Google Maps (по LINK_STOPS остановок в части). */
  links: string[];
}
export interface CourierTrips<T> {
  trips: Trip<T>[];
  lastArrivalMin: number;
  onTime: boolean;
  /** Среднее время прибытия по порциям, мин. */
  meanArrivalMin: number;
  totalKm: number;
  /** Сколько вариантов деления перебрано. */
  candidates: number;
}
export interface DayPlan<T> {
  couriers: CourierTrips<T>[];
  /** Доставки без координат — в рейсы не входят. */
  noPoint: T[];
  /** Использовано ручное распределение. */
  manual: boolean;
}
/** Ручное распределение дня: ключ точки (`stopKey`) → курьер и номер рейса. */
export interface RouteOverride {
  couriers: 1 | 2;
  assign: Record<string, { c: number; t: number }>;
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const hav = (a: LatLng, b: LatLng) => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

interface Tour {
  order: number[];
  km: number;
  /** Смещения прибытия к точкам (мин от выезда) и конец рейса. */
  arr: number[];
  endOff: number;
  weighted: number;
}

class Ctx<T> {
  stops: Stop<T>[];
  kitchen: LatLng;
  st: TripSettings;
  /** Индексы точек по углу вокруг кухни. */
  sorted: number[];
  tours = new Map<string, Tour>();
  constructor(stops: Stop<T>[], kitchen: LatLng, st: TripSettings) {
    this.stops = stops;
    this.kitchen = kitchen;
    this.st = st;
    const k = Math.cos(rad(kitchen.lat));
    const ang = (i: number) => Math.atan2(stops[i].lat - kitchen.lat, (stops[i].lng - kitchen.lng) * k);
    this.sorted = [...stops.keys()].sort((a, b) => ang(a) - ang(b));
  }
  km = (a: LatLng, b: LatLng) => hav(a, b) * this.st.roadFactor;
  drive = (a: LatLng, b: LatLng) => (this.km(a, b) / this.st.speedKmh) * 60;
}

function timeline<T>(c: Ctx<T>, order: number[], closed: boolean) {
  let t = 0;
  let prev: LatLng = c.kitchen;
  let km = 0;
  let weighted = 0;
  const arr: number[] = [];
  for (const i of order) {
    const s = c.stops[i];
    t += c.drive(prev, s);
    km += c.km(prev, s);
    arr.push(t);
    weighted += t * s.portions;
    t += c.st.stopMin;
    prev = s;
  }
  if (closed) {
    t += c.drive(prev, c.kitchen);
    km += c.km(prev, c.kitchen);
  }
  return { arr, endOff: t, km, weighted };
}

/**
 * Лучший порядок точек в рейсе. closed — кухня → точки → кухня (кратчайший замкнутый обход, затем направление с меньшим средним прибытием);
 * открытый — кратчайший путь от кухни без возврата. До 12 точек — точный (Хелд–Карп), больше — nearest neighbor + 2-opt.
 */
function bestTour<T>(c: Ctx<T>, idx: number[], closed: boolean): Tour {
  const key = `${[...idx].sort((a, b) => a - b).join(',')}${closed ? 'c' : 'o'}`;
  const hit = c.tours.get(key);
  if (hit) return hit;
  const m = idx.length;
  let order: number[];
  if (m === 1) order = [idx[0]];
  else if (m <= 12) {
    const D = (i: number, j: number) => c.km(c.stops[idx[i]], c.stops[idx[j]]);
    const K = (i: number) => c.km(c.kitchen, c.stops[idx[i]]);
    const N = 1 << m;
    const dp = new Float64Array(N * m).fill(Infinity);
    const par = new Int8Array(N * m).fill(-1);
    for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = K(j);
    for (let mask = 1; mask < N; mask++) {
      for (let j = 0; j < m; j++) {
        const cur = dp[mask * m + j];
        if (!(mask & (1 << j)) || cur === Infinity) continue;
        for (let n = 0; n < m; n++) {
          if (mask & (1 << n)) continue;
          const nm = mask | (1 << n);
          const v = cur + D(j, n);
          if (v < dp[nm * m + n] - 1e-12) {
            dp[nm * m + n] = v;
            par[nm * m + n] = j;
          }
        }
      }
    }
    let bj = 0;
    let bv = Infinity;
    for (let j = 0; j < m; j++) {
      const v = dp[(N - 1) * m + j] + (closed ? K(j) : 0);
      if (v < bv - 1e-12) {
        bv = v;
        bj = j;
      }
    }
    const seq: number[] = [];
    let mask = N - 1;
    let j = bj;
    while (j >= 0) {
      seq.push(idx[j]);
      const pj = par[mask * m + j];
      mask ^= 1 << j;
      j = pj;
    }
    order = seq.reverse();
  } else {
    const left = [...idx];
    order = [];
    let cur: LatLng = c.kitchen;
    while (left.length) {
      let bi = 0;
      for (let i = 1; i < left.length; i++) if (c.km(cur, c.stops[left[i]]) < c.km(cur, c.stops[left[bi]])) bi = i;
      const [x] = left.splice(bi, 1);
      order.push(x);
      cur = c.stops[x];
    }
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 100) {
      improved = false;
      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
          if (timeline(c, cand, closed).km + 1e-9 < timeline(c, order, closed).km) {
            order = cand;
            improved = true;
          }
        }
      }
    }
  }
  let tl = timeline(c, order, closed);
  if (closed) {
    const rev = [...order].reverse();
    const r = timeline(c, rev, true);
    if (r.weighted + 1e-9 < tl.weighted) {
      order = rev;
      tl = r;
    }
  }
  const tour: Tour = { order, km: tl.km, arr: tl.arr, endOff: tl.endOff, weighted: tl.weighted };
  c.tours.set(key, tour);
  return tour;
}

const permutations = (n: number): number[][] => {
  if (n > 5) return [[...Array(n).keys()], [...Array(n).keys()].reverse()];
  const out: number[][] = [];
  const rec = (a: number[], rest: number[]) => {
    if (!rest.length) return void out.push(a);
    rest.forEach((x, i) => rec([...a, x], rest.filter((_, j) => j !== i)));
  };
  rec([], [...Array(n).keys()]);
  return out;
};

interface Eval {
  feasible: boolean;
  mean: number;
  km: number;
  last: number;
  perm: number[];
  sectors: number[][];
}

function evaluate<T>(c: Ctx<T>, sectors: number[][], perms: number[][]): Eval {
  const P = sectors.reduce((s, sec) => s + sec.reduce((x, i) => x + c.stops[i].portions, 0), 0);
  let best: Eval | null = null;
  for (const perm of perms) {
    let t = c.st.departMin;
    let w = 0;
    let last = 0;
    let km = 0;
    perm.forEach((p, pi) => {
      const tr = bestTour(c, sectors[p], pi < perm.length - 1);
      tr.order.forEach((i, k) => {
        const a = t + tr.arr[k];
        w += a * c.stops[i].portions;
        last = Math.max(last, a);
      });
      km += tr.km;
      t += tr.endOff + c.st.gapMin;
    });
    const e: Eval = { feasible: last <= c.st.deadlineMin + 1e-9, mean: w / P, km, last, perm, sectors };
    if (!best || betterTrips(e, best)) best = e;
  }
  return best!;
}

/** а) успевают до конца окна; б) меньше среднее время прибытия по порциям; в) меньше км. */
function betterTrips(a: { feasible: boolean; mean: number; km: number }, b: { feasible: boolean; mean: number; km: number }): boolean {
  if (a.feasible !== b.feasible) return a.feasible;
  if (Math.abs(a.mean - b.mean) > 1e-6) return a.mean < b.mean;
  return a.km + 1e-9 < b.km;
}

/** Деление точек (по углу) на k подряд идущих секторов (по кругу) ≤ cap порций в каждом; перебираются все места разреза. Точка не делится. */
function sectorCandidates<T>(c: Ctx<T>, subset: number[], k: number, cap: number, limit = 6000): number[][][] {
  const inSet = new Set(subset);
  const sorted = c.sorted.filter((i) => inSet.has(i));
  const m = sorted.length;
  const p = sorted.map((i) => c.stops[i].portions);
  const total = p.reduce((a, b) => a + b, 0);
  const seen = new Set<string>();
  const out: number[][][] = [];
  for (let s = 0; s < m && out.length < limit; s++) {
    const rec = (pos: number, j: number, cuts: number[], secs: number[][], left: number) => {
      if (out.length >= limit) return;
      const take = (len: number) => Array.from({ length: len }, (_, q) => sorted[(s + pos + q) % m]);
      if (j === k - 1) {
        const len = m - pos;
        if (len < 1) return;
        const sec = take(len);
        if (sec.reduce((a, i) => a + c.stops[i].portions, 0) > cap) return;
        const key = [...cuts, pos].map((x) => (s + x) % m).sort((a, b) => a - b).join('-');
        if (!seen.has(key)) {
          seen.add(key);
          out.push([...secs, sec]);
        }
        return;
      }
      let sum = 0;
      for (let len = 1; pos + len <= m - (k - 1 - j); len++) {
        sum += p[(s + pos + len - 1) % m];
        if (sum > cap) break;
        if (left - sum > (k - 1 - j) * cap) continue;
        rec(pos + len, j + 1, [...cuts, pos], [...secs, take(len)], left - sum);
      }
    };
    rec(0, 0, [], [], total);
  }
  return out;
}

function buildTrips<T>(c: Ctx<T>, sectors: number[][], perm: number[], candidates: number): CourierTrips<T> {
  const trips: Trip<T>[] = [];
  let t = c.st.departMin;
  perm.forEach((p, pi) => {
    const closed = pi < perm.length - 1;
    const tr = bestTour(c, sectors[p], closed);
    const ordered = tr.order.map((i) => c.stops[i]);
    const portions = ordered.reduce((s, x) => s + x.portions, 0);
    trips.push({
      stops: ordered.map((stop, k) => ({ stop, key: stopKey(stop), arriveMin: t + tr.arr[k] })),
      portions,
      km: tr.km,
      startMin: t,
      endMin: t + tr.endOff,
      closed,
      overCapacity: portions > c.st.capacity,
      links: directionsLinks(c.kitchen, closed ? [...ordered, c.kitchen] : ordered),
    });
    t += tr.endOff + c.st.gapMin;
  });
  const P = trips.reduce((s, x) => s + x.portions, 0);
  const last = Math.max(...trips.flatMap((x) => x.stops.map((s) => s.arriveMin)));
  const mean = trips.reduce((s, x) => s + x.stops.reduce((a, y) => a + y.arriveMin * y.stop.portions, 0), 0) / P;
  return { trips, lastArrivalMin: last, onTime: last <= c.st.deadlineMin + 1e-9, meanArrivalMin: mean, totalKm: trips.reduce((s, x) => s + x.km, 0), candidates };
}

/** Рейсы одного курьера по его точкам (subset — индексы в ctx.stops). Один рейс (порций ≤ вместимости) — открытый маршрут. */
function planCourier<T>(c: Ctx<T>, subset: number[]): CourierTrips<T> | null {
  if (!subset.length) return null;
  const P = subset.reduce((s, i) => s + c.stops[i].portions, 0);
  const n0 = Math.ceil(P / c.st.capacity);
  if (n0 <= 1 || subset.length === 1) return buildTrips(c, [subset], [0], 1);
  let cands: number[][][] = [];
  for (let k = n0; k <= Math.min(subset.length, n0 + 2) && !cands.length; k++) cands = sectorCandidates(c, subset, k, c.st.capacity);
  if (!cands.length) {
    // точка крупнее рейса: делим как можно ближе к вместимости, переполнение неизбежно
    const maxStop = Math.max(...subset.map((i) => c.stops[i].portions));
    cands = sectorCandidates(c, subset, Math.min(subset.length, n0), Math.max(c.st.capacity, maxStop));
  }
  if (!cands.length) cands = [subset.map((i) => [i])];
  let best: Eval | null = null;
  for (const sec of cands) {
    const e = evaluate(c, sec, permutations(sec.length));
    if (!best || betterTrips(e, best)) best = e;
  }
  return buildTrips(c, best!.sectors, best!.perm, cands.length);
}

/** Ручное распределение: tripOf(i) → номер рейса; рейсы идут по возрастанию номера, порядок точек и время пересчитываются, переполнение разрешено. */
function planManual<T>(c: Ctx<T>, subset: number[], tripOf: (i: number) => number): CourierTrips<T> | null {
  if (!subset.length) return null;
  const nums = [...new Set(subset.map(tripOf))].sort((a, b) => a - b);
  const sectors = nums.map((n) => subset.filter((i) => tripOf(i) === n));
  return buildTrips(c, sectors, sectors.map((_, i) => i), 1);
}

/** Ручное распределение применимо, если число курьеров то же и есть хотя бы одна знакомая точка. */
export function overrideApplies<T>(stops: Stop<T>[], o: RouteOverride | null | undefined, couriers: 1 | 2): o is RouteOverride {
  return !!o && o.couriers === couriers && stops.some((s) => o.assign[stopKey(s)]);
}

/** Для новых точек (после ручной правки) берём рейс ближайшей по углу знакомой точки. */
function assignmentFor<T>(c: Ctx<T>, o: RouteOverride): { c: number; t: number }[] {
  const known = c.sorted.filter((i) => o.assign[stopKey(c.stops[i])]);
  const k = Math.cos(rad(c.kitchen.lat));
  const ang = (i: number) => Math.atan2(c.stops[i].lat - c.kitchen.lat, (c.stops[i].lng - c.kitchen.lng) * k);
  return c.stops.map((s, i) => {
    const a = o.assign[stopKey(s)];
    if (a) return a;
    let best = known[0];
    let bd = Infinity;
    for (const j of known) {
      let d = Math.abs(ang(i) - ang(j));
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return o.assign[stopKey(c.stops[best])];
  });
}

/** Сколько вариантов деления между курьерами оцениваем (самые ровные по порциям). */
const MAX_SPLITS = 60;

/** Деление между двумя курьерами: дуги по углу (по кругу), оба должны успеть, затем раньше последнее прибытие, среднее время, км. */
function planTwo<T>(c: Ctx<T>): CourierTrips<T>[] {
  const m = c.sorted.length;
  const P = c.stops.reduce((s, x) => s + x.portions, 0);
  // доли порций у курьеров не должны различаться больше чем на вместимость рейса (иначе перекос заведомо хуже)
  const maxDiff = Math.max(c.st.capacity, 4);
  type Pair = { a: CourierTrips<T>; b: CourierTrips<T> };
  let best: (Pair & { feasible: boolean; maxLast: number; mean: number; km: number }) | null = null;
  // все дуги (по кругу, любое начало и длина) с приемлемым перекосом порций; самые ровные оцениваем первыми, не больше MAX_SPLITS (предсказуемое время)
  const arcs: { arc: number[]; pA: number }[] = [];
  const seenSplit = new Set<string>();
  for (let r = 0; r < m; r++) {
    for (let s = 1; s <= m - 1; s++) {
      const arc = Array.from({ length: s }, (_, q) => c.sorted[(r + q) % m]);
      const pA = arc.reduce((x, i) => x + c.stops[i].portions, 0);
      if (Math.abs(P - 2 * pA) > maxDiff) continue;
      const key = [...arc].sort((x, y) => x - y).join(',');
      if (seenSplit.has(key)) continue;
      seenSplit.add(key);
      arcs.push({ arc, pA });
    }
  }
  arcs.sort((x, y) => Math.abs(P - 2 * x.pA) - Math.abs(P - 2 * y.pA));
  for (const { arc: arcA, pA } of arcs.slice(0, MAX_SPLITS)) {
    const inA = new Set(arcA);
    const arcB = c.sorted.filter((i) => !inA.has(i));
    if (!arcB.length) continue;
    const a = planCourier(c, arcA)!;
    const b = planCourier(c, arcB)!;
    const feasible = a.onTime && b.onTime;
    const maxLast = Math.max(a.lastArrivalMin, b.lastArrivalMin);
    const mean = (a.meanArrivalMin * pA + b.meanArrivalMin * (P - pA)) / P;
    const km = a.totalKm + b.totalKm;
    const better =
      !best ||
      (feasible !== best.feasible ? feasible : Math.abs(maxLast - best.maxLast) > 1e-6 ? maxLast < best.maxLast : Math.abs(mean - best.mean) > 1e-6 ? mean < best.mean : km + 1e-9 < best.km);
    if (better) best = { a, b, feasible, maxLast, mean, km };
  }
  if (!best) return [planCourier(c, c.sorted)!];
  // Курьер 1 — тот, чья первая точка ближе к кухне
  const d = (x: CourierTrips<T>) => hav(c.kitchen, x.trips[0].stops[0].stop);
  return d(best.a) <= d(best.b) ? [best.a, best.b] : [best.b, best.a];
}

/**
 * План дня: точки (одинаковые координаты/адрес — одна точка, не делится) → 1 или 2 курьера → рейсы у каждого.
 * Есть применимое ручное распределение — оно; иначе авто. Доставки без координат — в noPoint.
 */
export function planDay<T>(items: T[], a: Access<T>, kitchen: LatLng, couriers: 1 | 2, st: TripSettings, override?: RouteOverride | null): DayPlan<T> {
  const { stops, noPoint } = groupStops(items, a);
  if (!stops.length) return { couriers: [], noPoint, manual: false };
  const c = new Ctx(stops, kitchen, st);
  if (overrideApplies(stops, override, couriers)) {
    const asg = assignmentFor(c, override);
    const out: CourierTrips<T>[] = [];
    for (let ci = 1; ci <= couriers; ci++) {
      const sub = stops.map((_, i) => i).filter((i) => Math.min(couriers, Math.max(1, asg[i].c)) === ci);
      const r = planManual(c, sub, (i) => asg[i].t);
      if (r) out.push(r);
    }
    return { couriers: out, noPoint, manual: true };
  }
  if (couriers === 1 || stops.length < 2) return { couriers: [planCourier(c, c.sorted)!], noPoint, manual: false };
  return { couriers: planTwo(c), noPoint, manual: false };
}

/** Распределение текущего плана (для сохранения ручной правки): ключ точки → курьер и рейс. */
export function planAssignment<T>(p: DayPlan<T>): RouteOverride['assign'] {
  const assign: RouteOverride['assign'] = {};
  p.couriers.forEach((cr, ci) => cr.trips.forEach((t, ti) => t.stops.forEach((s) => (assign[s.key] = { c: ci + 1, t: ti + 1 }))));
  return assign;
}

/** Предупреждение по курьеру: не успевает до конца окна. */
export function lateWarning(cr: CourierTrips<unknown>, couriers: 1 | 2, index: number): string | null {
  if (cr.onTime) return null;
  return couriers === 2
    ? `⚠️ Курьер ${index + 1} не успевает: последний ≈ ${hhmm(cr.lastArrivalMin)}`
    : `⚠️ Не успевает: последний ≈ ${hhmm(cr.lastArrivalMin)} — нужен 2-й курьер`;
}
