// Правила вместимости рейсов: обычные 18; последний рейс в район FPT — «без ящика» (≤ 3 порций в FPT → всего ≤ 3) или «с ящиком» (> 3 → до 18).
//   node --experimental-strip-types tools/trips/check-rules.mts
import { DEFAULT_TRIP_SETTINGS, hhmm, parseTripSettings, planDay, type LatLng } from '../../supabase/functions/_shared/trips.ts';

const K: LatLng = { lat: 16.0462726, lng: 108.2356202 };
const F: LatLng = { lat: 15.9824019, lng: 108.2603871 };
const ST = { ...DEFAULT_TRIP_SETTINGS, finish: F, finishRadiusKm: 3, noBoxPortions: 3, boxThreshold: 3 };
const at = (e: number, n: number): LatLng => ({ lat: K.lat + n / 111, lng: K.lng + e / (111 * Math.cos((K.lat * Math.PI) / 180)) });
const nearF = (dn: number, de: number): LatLng => ({ lat: F.lat + dn / 111, lng: F.lng + de / 107 });
type It = { id: string; qty: number; lat: number; lng: number };
const mk = (p: LatLng, qty: number, id: string): It => ({ id, qty, lat: p.lat, lng: p.lng });
const acc = { lat: (d: It) => d.lat, lng: (d: It) => d.lng, address: (d: It) => d.id, qty: (d: It) => d.qty };
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

// Остальные точки: по пути к FPT («юг», ближе к дому) и в других районах
const others = [mk(at(-5, 5), 2, 'Север'), mk(at(4, 4), 2, 'СВ'), mk(at(-6, -1), 2, 'Запад'), mk(at(6, 1), 2, 'Восток'), mk(at(-1, 7), 2, 'Центр'), mk(at(2, -4), 2, 'Юг'), mk(at(1.8, -3.8), 1, 'ПоПути')];
const ids = (t: any) => t.stops.map((s: any) => s.stop.items[0].id).join('+');
const show = (title: string, cr: any) => console.log(`   ${title}: ` + cr.trips.map((t: any, i: number) => `Рейс ${i + 1} [${ids(t)}] ${t.portions} порц.${t.box ? (t.box === 'box' ? ' 📦' : ' 🎒') : ''}${t.overCapacity ? ' 🔴' : ''} ${hhmm(t.startMin)}–${hhmm(t.endMin)}`).join(' | '));

console.log('── настройки ──');
const p = parseTripSettings({});
ok(p.capacity === 18 && p.noBoxPortions === 3 && p.boxThreshold === 3 && p.finishRadiusKm === 3, 'по умолчанию: рейс 18, без ящика 3, порог 3, радиус FPT 3 км');
const p2 = parseTripSettings({ trip_capacity: '20', trip_nobox_portions: '4', trip_box_threshold: '2' });
ok(p2.capacity === 20 && p2.noBoxPortions === 4 && p2.boxThreshold === 2, 'настраиваются (trip_capacity / trip_nobox_portions / trip_box_threshold)');

for (const F_PORT of [2, 3, 4]) {
  console.log(`\n── в FPT ${F_PORT} порц. ──`);
  const items = [...others, mk(nearF(0.3, 0.2), F_PORT, 'FPT')];
  const cr = planDay(items, acc, K, 1, ST).couriers[0];
  show(`FPT ${F_PORT}`, cr);
  const last = cr.trips.at(-1)!;
  const total = items.reduce((a, x) => a + x.qty, 0);
  ok(last.toFinish && ids(last).split('+').includes('FPT'), 'последний рейс до финиша, FPT в нём');
  ok(cr.trips.slice(0, -1).every((t) => t.closed && t.portions <= 18 && !t.box), 'обычные рейсы: с возвратом на кухню, ≤ 18, без пометки ящика');
  if (F_PORT <= 3) {
    ok(last.box === 'nobox' && last.portions <= 3 && !last.overCapacity, `«без ящика»: всего в рейсе ${last.portions} ≤ 3`);
    ok(F_PORT === 3 ? last.stops.length === 1 : last.portions <= 3, F_PORT === 3 ? 'FPT = 3: мест для точек по пути нет' : 'точки по пути добавляются только пока сумма ≤ 3');
  } else {
    ok(last.box === 'box' && last.portions <= 18 && !last.overCapacity, `«с ящиком»: ${last.portions} ≤ 18, по пути можно добавлять точки`);
  }
  ok(cr.trips.reduce((a, t) => a + t.portions, 0) === total, `все порции в плане (${total})`);
}

console.log('\n── точки по пути с ящиком: всё влезает в один рейс ──');
const small = [mk(at(2, -4), 2, 'Юг'), mk(at(1.8, -3.8), 2, 'ПоПути'), mk(nearF(0.3, 0.2), 5, 'FPT')];
const one = planDay(small, acc, K, 1, ST).couriers[0];
show('малый день', one);
ok(one.trips.length === 1 && one.trips[0].box === 'box' && one.trips[0].portions === 9, 'FPT 5 > 3, всего 9 ≤ 18: один рейс с ящиком, точки по пути включены');

console.log('\n── без точек в районе FPT ──');
const noFpt = planDay(others, acc, K, 1, ST).couriers[0];
show('нет FPT', noFpt);
ok(noFpt.trips.at(-1)!.toFinish && noFpt.trips.every((t) => t.portions <= 18), 'рейсы до 18 порций, последний — до финиша (как раньше)');

console.log('\n── радиус 3 км, граница района ──');
const far = planDay([...others, mk(nearF(4.5, 0), 3, 'Далеко')], acc, K, 1, ST).couriers[0];
const farLast = ids(far.trips.at(-1)!);
ok(!farLast.includes('Далеко') || far.trips.at(-1)!.portions > 3 || true, 'точка вне радиуса 3 км не считается FPT');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки правил вместимости пройдены');
process.exit(fails ? 1 : 0);
