// Рейсы курьера по вместимости: чистые функции без зависимостей и без платных сервисов (расстояние = по прямой × коэффициент).
// ВАЖНО: файл дублируется в src/lib/admin/trips.ts (админка) — править оба одинаково (сверка: diff, различается только строка импорта).
import { directionsLinks, groupStops, type Access, type LatLng, type Stop } from './route';

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
  /** Финиш курьера (дом): последний рейс дня заканчивается здесь (кухня → точки → финиш). Нет — последний рейс открытый, до последней точки. При 2 курьерах — только у первого. */
  finish?: LatLng | null;
  /** Радиус вокруг финиша, км (по прямой): точки внутри него — всегда отдельный последний рейс кухня → эти точки → финиш, независимо от порций. */
  finishRadiusKm?: number;
  /** Последний рейс «без ящика»: если в районе финиша (FPT) порций ≤ boxThreshold, на весь рейс не больше noBoxPortions (по пути можно добавить точки, пока сумма ≤ этого числа). */
  noBoxPortions?: number;
  /** Порог для ящика: порций в районе финиша БОЛЬШЕ этого числа — рейс «с ящиком» (до capacity порций, по пути можно добавлять точки). */
  boxThreshold?: number;
}

export const DEFAULT_TRIP_SETTINGS: TripSettings = { capacity: 18, speedKmh: 25, stopMin: 4, roadFactor: 1.3, departMin: 13 * 60, deadlineMin: 16 * 60, gapMin: 10 };

const hm = (v: string | undefined, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? '').trim());
  return m ? +m[1] * 60 + +m[2] : d;
};
const num = (v: string | undefined, d: number, min: number, max: number) => {
  if (v === undefined || v.trim() === '') return d; // нет значения — по умолчанию (а не 0)
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : d;
};

/** Ключи settings: trip_capacity, trip_nobox_portions, trip_box_threshold, courier_speed_kmh, stop_minutes, road_factor, depart_time, deadline_time, trip_gap_min. Неверные/пустые — значения по умолчанию. */
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
    finish: parseFinish(s),
    finishRadiusKm: num(s.courier_finish_radius_km, 3, 0.1, 30),
    noBoxPortions: Math.round(num(s.trip_nobox_portions, 3, 1, 50)),
    boxThreshold: Math.round(num(s.trip_box_threshold, 3, 0, 50)),
  };
}

/** Финиш из settings (courier_finish_lat/lng): координаты в пределах Дананга, иначе null (финиша нет). */
export function parseFinish(s: Record<string, string | undefined>): LatLng | null {
  const a = (s.courier_finish_lat ?? '').trim();
  const b = (s.courier_finish_lng ?? '').trim();
  if (!a || !b) return null;
  const lat = Number(a.replace(',', '.'));
  const lng = Number(b.replace(',', '.'));
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 15.9 && lat <= 16.2 && lng >= 107.9 && lng <= 108.5 ? { lat, lng } : null;
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
  /** true — кухня → точки → кухня (промежуточные рейсы); последний рейс (и единственный) — открытый, до последней точки (или до финиша). */
  closed: boolean;
  /** Последний рейс заканчивается в «Финише» курьера. */
  toFinish: boolean;
  /** Отрезок «последняя точка → финиш», км (в `km` и ЗП не входит); 0, если финиша нет. */
  finishKm: number;
  overCapacity: boolean;
  /** Только у рейса до финиша: «с ящиком» / «без ящика» (по порциям в районе финиша). */
  box?: 'box' | 'nobox';
  /** Ссылки Google Maps (по LINK_STOPS остановок в части). */
  links: string[];
}
export interface CourierTrips<T> {
  trips: Trip<T>[];
  lastArrivalMin: number;
  onTime: boolean;
  /** Среднее время прибытия по порциям, мин. */
  meanArrivalMin: number;
  /** Км по заказам (до последней точки; возвраты на кухню между рейсами входят, отрезок до финиша — нет): по нему ЗП курьера. */
  totalKm: number;
  /** Отрезок «последний заказ → финиш», км (0, если финиша нет). */
  finishKm: number;
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

/** Последний рейс (до финиша): порции в районе финиша → вместимость и «ящик». Нет точек в районе — обычная вместимость, ящик по числу порций. */
function lastTripInfo<T>(c: Ctx<T>, stops: Stop<T>[], portions: number): { limit: number; box: 'box' | 'nobox' } {
  const f = c.st.finish;
  const R = c.st.finishRadiusKm ?? 3;
  const thr = c.st.boxThreshold ?? 3;
  const noBox = c.st.noBoxPortions ?? 3;
  const F = f ? stops.filter((x) => hav(x, f) <= R + 1e-9).reduce((a, x) => a + x.portions, 0) : 0;
  if (F > thr) return { limit: c.st.capacity, box: 'box' };
  if (F === 0) return { limit: c.st.capacity, box: portions > noBox ? 'box' : 'nobox' };
  return { limit: noBox, box: 'nobox' };
}

interface Tour {
  order: number[];
  km: number;
  /** Смещения прибытия к точкам (мин от выезда) и конец рейса. */
  arr: number[];
  endOff: number;
  weighted: number;
  /** Отрезок до финиша (только в режиме 'finish'), не входит в km. */
  finishKm: number;
}

type Mode = 'closed' | 'open' | 'finish';

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

function timeline<T>(c: Ctx<T>, order: number[], closed: boolean, toFinish = false) {
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
  let finishKm = 0;
  if (closed) {
    t += c.drive(prev, c.kitchen);
    km += c.km(prev, c.kitchen);
  } else if (toFinish && c.st.finish) finishKm = c.km(prev, c.st.finish);
  return { arr, endOff: t, km, weighted, finishKm };
}

/**
 * Лучший порядок точек в рейсе. closed — кухня → точки → кухня (кратчайший замкнутый обход, затем направление с меньшим средним прибытием);
 * открытый — кратчайший путь от кухни без возврата. До 12 точек — точный (Хелд–Карп), больше — nearest neighbor + 2-opt.
 */
function bestTour<T>(c: Ctx<T>, idx: number[], mode: Mode): Tour {
  const closed = mode === 'closed';
  const toFinish = mode === 'finish' && !!c.st.finish;
  const key = `${[...idx].sort((a, b) => a - b).join(',')}${closed ? 'c' : toFinish ? 'f' : 'o'}`;
  const hit = c.tours.get(key);
  if (hit) return hit;
  const m = idx.length;
  let order: number[];
  if (m === 1) order = [idx[0]];
  else if (m <= 12) {
    const D = (i: number, j: number) => c.km(c.stops[idx[i]], c.stops[idx[j]]);
    const K = (i: number) => c.km(c.kitchen, c.stops[idx[i]]);
    const F = (i: number) => (toFinish ? c.km(c.stops[idx[i]], c.st.finish!) : 0);
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
      const v = dp[(N - 1) * m + j] + (closed ? K(j) : F(j));
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
          const a = timeline(c, cand, closed, toFinish);
          const b = timeline(c, order, closed, toFinish);
          if (a.km + a.finishKm + 1e-9 < b.km + b.finishKm) {
            order = cand;
            improved = true;
          }
        }
      }
    }
  }
  let tl = timeline(c, order, closed, toFinish);
  if (closed) {
    const rev = [...order].reverse();
    const r = timeline(c, rev, true);
    if (r.weighted + 1e-9 < tl.weighted) {
      order = rev;
      tl = r;
    }
  }
  const tour: Tour = { order, km: tl.km, arr: tl.arr, endOff: tl.endOff, weighted: tl.weighted, finishKm: tl.finishKm };
  c.tours.set(key, tour);
  return tour;
}

const permutations = (n: number, lastChoices = false): number[][] => {
  // больше 5 рейсов не бывает на практике: два порядка, а при финише — ещё по одному на каждый вариант «последнего» рейса
  if (n > 5) {
    const base = [[...Array(n).keys()], [...Array(n).keys()].reverse()];
    if (lastChoices) for (let l = 0; l < n; l++) base.push([...Array(n).keys()].filter((x) => x !== l).concat(l));
    return base;
  }
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
  /** Км по заказам (без отрезка до финиша) и с ним — по второму сравниваем варианты, когда есть финиш. */
  km: number;
  kmAll: number;
  last: number;
  perm: number[];
  sectors: number[][];
}

function evaluate<T>(c: Ctx<T>, sectors: number[][], perms: number[][], fin: boolean, closeAll = false): Eval {
  const P = sectors.reduce((s, sec) => s + sec.reduce((x, i) => x + c.stops[i].portions, 0), 0);
  let best: Eval | null = null;
  for (const perm of perms) {
    let t = c.st.departMin;
    let w = 0;
    let last = 0;
    let km = 0;
    let kmAll = 0;
    perm.forEach((p, pi) => {
      const tr = bestTour(c, sectors[p], closeAll || pi < perm.length - 1 ? 'closed' : fin ? 'finish' : 'open');
      tr.order.forEach((i, k) => {
        const a = t + tr.arr[k];
        w += a * c.stops[i].portions;
        last = Math.max(last, a);
      });
      km += tr.km;
      kmAll += tr.km + tr.finishKm;
      t += tr.endOff + c.st.gapMin;
    });
    const e: Eval = { feasible: last <= c.st.deadlineMin + 1e-9, mean: w / P, km, kmAll, last, perm, sectors };
    if (!best || betterTrips(e, best, fin)) best = e;
  }
  return best!;
}

/**
 * а) успевают до конца окна; б) меньше среднее время прибытия по порциям; в) меньше км.
 * Если задан финиш (fin): после а) — меньше общий путь до финиша (точки возле дома — в последнем рейсе), затем среднее время.
 */
function betterTrips(a: { feasible: boolean; mean: number; km: number; kmAll: number }, b: { feasible: boolean; mean: number; km: number; kmAll: number }, fin = false): boolean {
  if (a.feasible !== b.feasible) return a.feasible;
  if (fin && Math.abs(a.kmAll - b.kmAll) > 1e-6) return a.kmAll < b.kmAll;
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

function buildTrips<T>(c: Ctx<T>, sectors: number[][], perm: number[], candidates: number, fin: boolean, closeAll = false): CourierTrips<T> {
  const trips: Trip<T>[] = [];
  let t = c.st.departMin;
  perm.forEach((p, pi) => {
    const closed = closeAll || pi < perm.length - 1;
    const toFinish = !closed && fin && !!c.st.finish;
    const tr = bestTour(c, sectors[p], closed ? 'closed' : toFinish ? 'finish' : 'open');
    const ordered = tr.order.map((i) => c.stops[i]);
    const portions = ordered.reduce((s, x) => s + x.portions, 0);
    const info = toFinish ? lastTripInfo(c, ordered, portions) : null;
    trips.push({
      stops: ordered.map((stop, k) => ({ stop, key: stopKey(stop), arriveMin: t + tr.arr[k] })),
      portions,
      km: tr.km,
      startMin: t,
      endMin: t + tr.endOff,
      closed,
      toFinish,
      finishKm: tr.finishKm,
      overCapacity: portions > (info?.limit ?? c.st.capacity),
      ...(info ? { box: info.box } : {}),
      links: directionsLinks(c.kitchen, closed ? [...ordered, c.kitchen] : toFinish ? [...ordered, c.st.finish!] : ordered),
    });
    t += tr.endOff + c.st.gapMin;
  });
  return summarize(c, trips, candidates);
}

function summarize<T>(c: Ctx<T>, trips: Trip<T>[], candidates: number): CourierTrips<T> {
  const P = trips.reduce((s, x) => s + x.portions, 0);
  const last = Math.max(...trips.flatMap((x) => x.stops.map((s) => s.arriveMin)));
  const mean = trips.reduce((s, x) => s + x.stops.reduce((a, y) => a + y.arriveMin * y.stop.portions, 0), 0) / P;
  return { trips, lastArrivalMin: last, onTime: last <= c.st.deadlineMin + 1e-9, meanArrivalMin: mean, totalKm: trips.reduce((s, x) => s + x.km, 0), finishKm: trips.reduce((s, x) => s + x.finishKm, 0), candidates };
}

/** Рейсы: остальные точки (left) обычными рейсами с возвратом на кухню, затем последний рейс (last) кухня → точки → финиш. */
function homeTrips<T>(c: Ctx<T>, left: number[], last: number[], f: LatLng): CourierTrips<T> {
  const head = left.length ? planCore(c, left, false, true) : null;
  const trips = head ? [...head.trips] : [];
  const start = trips.length ? trips[trips.length - 1].endMin + c.st.gapMin : c.st.departMin;
  const tr = bestTour(c, last, 'finish');
  const ordered = tr.order.map((i) => c.stops[i]);
  const portions = ordered.reduce((x, y) => x + y.portions, 0);
  const info = lastTripInfo(c, ordered, portions);
  trips.push({
    stops: ordered.map((stop, k) => ({ stop, key: stopKey(stop), arriveMin: start + tr.arr[k] })),
    portions,
    km: tr.km,
    startMin: start,
    endMin: start + tr.endOff,
    closed: false,
    toFinish: true,
    finishKm: tr.finishKm,
    overCapacity: portions > info.limit,
    box: info.box,
    links: directionsLinks(c.kitchen, [...ordered, f]),
  });
  return summarize(c, trips, head?.candidates ?? 1);
}

/** Рейсы одного курьера по его точкам (subset — индексы в ctx.stops). Один рейс (порций ≤ вместимости) — открытый маршрут. */
function planCourier<T>(c: Ctx<T>, subset: number[], fin: boolean): CourierTrips<T> | null {
  if (!subset.length) return null;
  const f = c.st.finish;
  if (fin && f) {
    // Точки в радиусе от финиша (дом) — всегда отдельный последний рейс кухня → эти точки → финиш; остальные делятся как обычно, каждый рейс с возвратом на кухню.
    const R = c.st.finishRadiusKm ?? 3;
    const home = subset.filter((i) => hav(c.stops[i], f) <= R + 1e-9);
    if (home.length) {
      // Последний рейс = точки FPT + (по пути) соседние точки, пока влезает: порций в FPT ≤ порога → «без ящика», всего ≤ noBoxPortions; больше порога → «с ящиком», до capacity.
      const rest = subset.filter((i) => !home.includes(i));
      const pt = (i: number) => c.stops[i].portions;
      const F = home.reduce((x, i) => x + pt(i), 0);
      const limit = F > (c.st.boxThreshold ?? 3) ? c.st.capacity : (c.st.noBoxPortions ?? 3);
      const base = bestTour(c, home, 'finish');
      const baseLen = base.km + base.finishKm;
      // кандидаты «по пути» — по возрастанию крюка (доп. путь последнего рейса)
      const detour = new Map(rest.map((i) => { const t = bestTour(c, [...home, i], 'finish'); return [i, t.km + t.finishKm - baseLen] as const; }));
      const order = rest.filter((i) => F + pt(i) <= limit).sort((a, b) => detour.get(a)! - detour.get(b)!).slice(0, 12);
      const options: number[][] = [[]];
      let sel: number[] = [];
      let sum = F;
      for (const i of order) {
        if (sum + pt(i) > limit) continue;
        sel = [...sel, i];
        sum += pt(i);
        options.push(sel);
        if (options.length > 9) break;
      }
      let best: CourierTrips<T> | null = null;
      for (const extra of options) {
        const last = [...home, ...extra];
        const left = rest.filter((i) => !extra.includes(i));
        const r = homeTrips(c, left, last, f);
        const m = (x: CourierTrips<T>) => ({ feasible: x.onTime, mean: x.meanArrivalMin, km: x.totalKm, kmAll: x.totalKm + x.finishKm });
        if (!best || betterTrips(m(r), m(best), true)) best = r;
      }
      return best;
    }
  }
  return planCore(c, subset, fin, false);
}

function planCore<T>(c: Ctx<T>, subset: number[], fin: boolean, closeAll: boolean): CourierTrips<T> {
  const P = subset.reduce((s, i) => s + c.stops[i].portions, 0);
  const n0 = Math.ceil(P / c.st.capacity);
  if (n0 <= 1 || subset.length === 1) return buildTrips(c, [subset], [0], 1, fin, closeAll);
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
    const e = evaluate(c, sec, permutations(sec.length, fin), fin, closeAll);
    if (!best || betterTrips(e, best, fin)) best = e;
  }
  return buildTrips(c, best!.sectors, best!.perm, cands.length, fin, closeAll);
}

/** Ручное распределение: tripOf(i) → номер рейса; рейсы идут по возрастанию номера, порядок точек и время пересчитываются, переполнение разрешено. */
function planManual<T>(c: Ctx<T>, subset: number[], tripOf: (i: number) => number, fin: boolean): CourierTrips<T> | null {
  if (!subset.length) return null;
  const nums = [...new Set(subset.map(tripOf))].sort((a, b) => a - b);
  const sectors = nums.map((n) => subset.filter((i) => tripOf(i) === n));
  return buildTrips(c, sectors, sectors.map((_, i) => i), 1, fin);
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
  type Pair = { a: CourierTrips<T>; b: CourierTrips<T>; finA?: boolean };
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
    // финиш — только у первого курьера: пробуем обе дуги в роли «курьера с финишем» (без финиша — одна раскладка)
    const roles: [boolean, boolean][] = c.st.finish ? [[true, false], [false, true]] : [[false, false]];
    for (const [finA, finB] of roles) {
      const a = planCourier(c, arcA, finA)!;
      const b = planCourier(c, arcB, finB)!;
      const feasible = a.onTime && b.onTime;
      const maxLast = Math.max(a.lastArrivalMin, b.lastArrivalMin);
      const mean = (a.meanArrivalMin * pA + b.meanArrivalMin * (P - pA)) / P;
      const km = a.totalKm + b.totalKm + a.finishKm + b.finishKm;
      const better =
        !best ||
        (feasible !== best.feasible
          ? feasible
          : c.st.finish && Math.abs(km - best.km) > 1e-6
            ? km < best.km // с финишем: короче общий путь (точки у дома достаются курьеру с финишем)
            : Math.abs(maxLast - best.maxLast) > 1e-6
              ? maxLast < best.maxLast
              : Math.abs(mean - best.mean) > 1e-6
                ? mean < best.mean
                : km + 1e-9 < best.km);
      if (better) best = { a, b, feasible, maxLast, mean, km, finA };
    }
  }
  if (!best) return [planCourier(c, c.sorted, !!c.st.finish)!];
  // С финишем Курьер 1 — тот, у кого финиш; иначе — тот, чья первая точка ближе к кухне
  if (c.st.finish) return best.finA ? [best.a, best.b] : [best.b, best.a];
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
      const r = planManual(c, sub, (i) => asg[i].t, ci === 1 && !!c.st.finish);
      if (r) out.push(r);
    }
    return { couriers: out, noPoint, manual: true };
  }
  if (couriers === 1 || stops.length < 2) return { couriers: [planCourier(c, c.sorted, !!c.st.finish)!], noPoint, manual: false };
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
