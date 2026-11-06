// Локальная проверка планировщика рейсов на выдуманных данных (без БД, Telegram, Google, деплоя):
//   node --experimental-strip-types tools/trips/check.mts
import { DEFAULT_TRIP_SETTINGS as DEF, hhmm, planAssignment, planDay, type CourierTrips, type DayPlan, type RouteOverride } from '../../supabase/functions/_shared/trips.ts';
const ST = { ...DEF, capacity: 9 }; // проверки написаны под вместимость 9 (боевая — 18, см. check-rules.mts)
import type { LatLng } from '../../supabase/functions/_shared/route.ts';

const K: LatLng = { lat: 16.0462726, lng: 108.2356202 };
const at = (e: number, n: number): LatLng => ({ lat: K.lat + n / 111, lng: K.lng + e / (111 * Math.cos((K.lat * Math.PI) / 180)) });
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
type It = { id: string; qty: number; lat: number | null; lng: number | null };
let uid = 0;
const mk = (p: LatLng | null, qty = 1): It => ({ id: `P${++uid}`, qty, lat: p?.lat ?? null, lng: p?.lng ?? null });
const acc = { lat: (d: It) => d.lat, lng: (d: It) => d.lng, address: (d: It) => d.id, qty: (d: It) => d.qty };
const rand = (n: number, r: number, qty = 1) => Array.from({ length: n }, () => { const a = rnd() * 2 * Math.PI, d = 1 + rnd() * r; return mk(at(Math.cos(a) * d, Math.sin(a) * d), qty); });
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } };
const kk = `${K.lat.toFixed(6)},${K.lng.toFixed(6)}`;

function check(items: It[], plan: DayPlan<It>, couriers: number) {
  const total = items.filter((i) => i.lat != null).reduce((s, i) => s + i.qty, 0);
  let seen = 0;
  const ids: string[] = [];
  plan.couriers.forEach((cr: CourierTrips<It>) => cr.trips.forEach((t, ti) => {
    seen += t.portions;
    t.stops.forEach((s) => s.stop.items.forEach((x) => ids.push(x.id)));
    if (!plan.manual) ok(!t.overCapacity || t.stops.length === 1, `рейс ${ti + 1}: больше вместимости при нескольких точках`);
    const last = ti === cr.trips.length - 1;
    ok(t.closed === !last, `рейс ${ti + 1}: closed=${t.closed}, последний — открытый, остальные замкнуты`);
    const u = new URL(t.links[t.links.length - 1]).searchParams;
    ok(t.closed ? u.get('destination') === kk : u.get('destination') !== kk, `рейс ${ti + 1}: финиш ссылки`);
    ok(t.links.length === Math.ceil((t.stops.length + (t.closed ? 1 : 0)) / 9), `рейс ${ti + 1}: число ссылок`);
    if (ti > 0) ok(Math.abs(t.startMin - (cr.trips[ti - 1].endMin + ST.gapMin)) < 1e-6, `рейс ${ti + 1}: стык (конец + пауза = старт)`);
    ok(t.stops.every((s, i, a) => i === 0 || a[i - 1].arriveMin <= s.arriveMin), 'прибытия не по порядку');
  }));
  ok(seen === total, `порции: ${seen} из ${total}`);
  ok(new Set(ids).size === ids.length, 'точка в двух рейсах');
  ok(plan.couriers.length <= couriers, 'курьеров больше заказанного');
}
function show(title: string, items: It[], couriers: 1 | 2, override?: RouteOverride | null) {
  const t0 = performance.now();
  const plan = planDay(items, acc, K, couriers, ST, override);
  const ms = performance.now() - t0;
  console.log(`\n━━ ${title} — курьеров: ${couriers}${plan.manual ? ' (ручное)' : ''} (${ms.toFixed(0)} мс) ━━`);
  check(items, plan, couriers);
  plan.couriers.forEach((cr, ci) => {
    console.log(`  Курьер ${ci + 1}: рейсов ${cr.trips.length}, перебрано ${cr.candidates}, ср. прибытие ${hhmm(cr.meanArrivalMin)}, последний ${hhmm(cr.lastArrivalMin)} ${cr.onTime ? '✅' : '⚠️ не успевает'}, ${cr.totalKm.toFixed(1)} км`);
    let n = 0;
    cr.trips.forEach((t, ti) => {
      console.log(`    🚚 Рейс ${ti + 1} — ${t.portions} порц. · ≈ ${t.km.toFixed(1)} км · ${hhmm(t.startMin)}–${hhmm(t.endMin)}${t.overCapacity ? ' 🔴' : ''}${t.closed ? '' : ' (открытый)'} · точек ${t.stops.length}, ссылок ${t.links.length}`);
      console.log('       ' + t.stops.map((s) => `${++n}:${s.stop.portions}п≈${hhmm(s.arriveMin)}`).join('  '));
    });
  });
  if (plan.noPoint.length) console.log(`  ⚠️ Без точки: ${plan.noPoint.map((x) => `${x.id}×${x.qty}`).join(', ')}`);
  return plan;
}

const A = () => [...Array.from({ length: 9 }, (_, i) => mk(at(1 + (i % 3) * 0.5, 0.5 + Math.floor(i / 3) * 0.5))), mk(at(-1, 9)), mk(at(-1.3, 9.3))];
const B = () => [...Array.from({ length: 6 }, (_, i) => mk(at(4 + i * 0.3, 3.5 + i * 0.25))), ...Array.from({ length: 5 }, (_, i) => mk(at(-4 - i * 0.3, -3.5 - i * 0.25)))];
show('A: 11 порций (9 рядом + 2 далеко)', A(), 1);
show('B: 11 порций, 6 СВ + 5 ЮЗ', B(), 1);
show('B2: 11 порций, 6 СВ + 5 ЮЗ', B(), 2);
for (const n of [15, 20, 30]) for (const c of [1, 2] as const) show(`C: ${n} порций`, rand(n, 9), c);
show('D: 10 точек по 2 порции', rand(10, 8, 2), 1);
show('D2: 10 точек по 2 порции', rand(10, 8, 2), 2);
show('E: 11 + точка без координат (2 порц.)', [...rand(11, 7), mk(null, 2)], 1);
show('F: точка на 10 порций + 2 малых', [mk(at(2, 2), 10), mk(at(-3, 4)), mk(at(5, -2))], 1);
show('G: 9 порций — один открытый рейс', rand(9, 6), 1);
show('H: 40 порций, 1 курьер', rand(40, 12), 1);

// ручное распределение: A → все точки в рейс 1 (переполнение), затем две далёкие во 2-й, затем новая точка без записи
console.log('\n━━ Ручное распределение ━━');
const items = A();
const auto = planDay(items, acc, K, 1, ST);
const asg = planAssignment(auto);
const allOne: RouteOverride = { couriers: 1, assign: Object.fromEntries(Object.keys(asg).map((k) => [k, { c: 1, t: 1 }])) };
const m1 = show('ручное: всё в рейс 1', items, 1, allOne);
ok(m1.couriers[0].trips[0].overCapacity && m1.couriers[0].trips.length === 1, 'ручной перенос: переполнение должно быть помечено, рейс один');
const reset = planDay(items, acc, K, 1, ST, null);
ok(reset.couriers[0].trips.length === 2 && !reset.manual, '«Сбросить к авто»: снова авто, 2 рейса');
const withNew = [...items, mk(at(1.2, 0.8))];
const m2 = planDay(withNew, acc, K, 1, ST, { couriers: 1, assign: asg });
ok(m2.manual && m2.couriers[0].trips.reduce((s, t) => s + t.portions, 0) === 12, 'новая точка после ручной правки попала в план');
const stale = planDay(items, acc, K, 2, ST, { couriers: 1, assign: asg });
ok(!stale.manual, 'ручное распределение для другого числа курьеров игнорируется');
console.log(`  новая точка после ручной правки: рейсы ${m2.couriers[0].trips.map((t) => t.portions).join('+')} порц.`);
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки пройдены');
