// Финиш курьера (дом): локальная проверка на выдуманных данных, без БД/Telegram/Google:
//   node --experimental-strip-types tools/trips/check-finish.mts
import { DEFAULT_TRIP_SETTINGS, hhmm, parseTripSettings, planDay, type CourierTrips } from '../../supabase/functions/_shared/trips.ts';
import { computeDayPay, DEFAULT_PAY } from '../../supabase/functions/_shared/courier-pay.ts';
import { buildCourierReport } from '../../supabase/functions/_shared/courier-report.ts';
import type { LatLng } from '../../supabase/functions/_shared/route.ts';

const K: LatLng = { lat: 16.0462726, lng: 108.2356202 };
const F: LatLng = { lat: 15.9824019, lng: 108.2603871 }; // FPT City (дом)
const ST = { ...DEFAULT_TRIP_SETTINGS, finish: F };
const at = (e: number, n: number): LatLng => ({ lat: K.lat + n / 111, lng: K.lng + e / (111 * Math.cos((K.lat * Math.PI) / 180)) });
const nearF = (dn: number, de: number): LatLng => ({ lat: F.lat + dn / 111, lng: F.lng + de / 107 });
type It = { id: string; qty: number; lat: number; lng: number };
let uid = 0;
const mk = (p: LatLng, qty = 1, id?: string): It => ({ id: id ?? `P${++uid}`, qty, lat: p.lat, lng: p.lng });
const acc = { lat: (d: It) => d.lat, lng: (d: It) => d.lng, address: (d: It) => d.id, qty: (d: It) => d.qty };
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };
const dest = (u: string) => new URL(u).searchParams.get('destination');
const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const lastTrip = (c: CourierTrips<It>) => c.trips[c.trips.length - 1];
const lastStop = (c: CourierTrips<It>) => lastTrip(c).stops[lastTrip(c).stops.length - 1].stop.items[0].id;
const show = (c: CourierTrips<It>, title: string) => console.log(`   ${title}: ` + c.trips.map((t, i) => `Рейс ${i + 1} [${t.stops.map((s) => s.stop.items[0].id).join(' → ')}]${t.toFinish ? ` → 🏠 (+${t.finishKm.toFixed(1)} км)` : ''} ${hhmm(t.startMin)}–${hhmm(t.endMin)}`).join(' | '));

console.log('\n── 1 рейс (7 порций): заказ в FPT City + точки в других районах ──');
const A = [mk(at(-4, 5), 1, 'Север'), mk(at(3, 4), 1, 'СВ'), mk(at(-5, -2), 1, 'Запад'), mk(at(6, 1), 1, 'Восток'), mk(at(-1, 7), 1, 'Центр'), mk(at(2, -3), 1, 'Юг'), mk(nearF(0.3, 0.2), 1, 'FPT')];
const withF = planDay(A, acc, K, 1, ST).couriers[0];
const noF = planDay(A, acc, K, 1, { ...DEFAULT_TRIP_SETTINGS }).couriers[0];
show(withF, 'с финишем'); show(noF, 'без финиша');
ok(withF.trips.length === 1 && withF.trips[0].toFinish && !withF.trips[0].closed, 'единственный рейс идёт до финиша (открытый, toFinish)');
ok(lastStop(withF) === 'FPT', 'точка в FPT City — последняя');
ok(dest(withF.trips[0].links.at(-1)!) === fmt(F), 'последняя точка ссылки = финиш (дом)');
ok(withF.trips[0].links.every((u) => u.includes('origin=' + fmt(K)) || true) && new URL(withF.trips[0].links[0]).searchParams.get('origin') === fmt(K), 'ссылка начинается на кухне');
ok(withF.finishKm > 0 && withF.finishKm < 3, `отрезок до финиша учтён отдельно: ${withF.finishKm.toFixed(2)} км`);
ok(Math.abs(withF.totalKm - withF.trips[0].km) < 1e-9, 'totalKm (для ЗП) = км до последнего заказа, без отрезка до дома');
ok(!noF.trips[0].toFinish && noF.finishKm === 0 && dest(noF.trips[0].links.at(-1)!) !== fmt(F), 'без финиша: поведение как раньше (открытый рейс до последней точки)');
const noFnull = planDay(A, acc, K, 1, { ...DEFAULT_TRIP_SETTINGS, finish: null }).couriers[0];
ok(JSON.stringify(noFnull) === JSON.stringify(noF), 'finish: null ≡ финиш не задан');
// «дальний» заказ последним без финиша, но с финишем — FPT последний
const km = (a: LatLng, b: LatLng) => { const r = Math.PI / 180, h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3; };
const lastNoF = noF.trips[0].stops.at(-1)!.stop;
console.log(`   без финиша последний: ${lastNoF.items[0].id}, до дома от него ≈ ${km(lastNoF, F).toFixed(1)} км; с финишем до дома ≈ ${withF.finishKm.toFixed(1)} км`);

console.log('\n── 2 рейса (12 порций) ──');
const B = [mk(at(-5, 6), 2, 'С1'), mk(at(-3, 5), 2, 'С2'), mk(at(4, 6), 1, 'СВ1'), mk(at(6, 3), 2, 'В1'), mk(at(-6, -2), 2, 'З1'), mk(at(1, -5), 1, 'Ю1'), mk(nearF(0.4, -0.2), 1, 'FPT1'), mk(nearF(-0.2, 0.3), 1, 'FPT2')];
const two = planDay(B, acc, K, 1, ST).couriers[0];
show(two, 'с финишем');
ok(two.trips.length === 2 && two.trips[0].closed && !two.trips[0].toFinish && two.trips[1].toFinish, 'промежуточный рейс — с возвратом на кухню, последний — до финиша');
ok(['FPT1', 'FPT2'].every((id) => two.trips[1].stops.some((s) => s.stop.items[0].id === id)), 'точки у дома (FPT) — в последнем рейсе');
ok(['FPT1', 'FPT2'].includes(lastStop(two)), 'и идут в конце последнего рейса');
ok(dest(lastTrip(two).links.at(-1)!) === fmt(F) && dest(two.trips[0].links.at(-1)!) === fmt(K), 'ссылки: рейс 1 — до кухни, рейс 2 — до 🏠 финиша');
ok(two.trips.every((t) => t.portions <= 9), 'вместимость соблюдена');
const noTwo = planDay(B, acc, K, 1, { ...DEFAULT_TRIP_SETTINGS }).couriers[0];
show(noTwo, 'без финиша');

console.log('\n── ЗП: бензин до последнего заказа, без отрезка до дома ──');
const dayItems = A.map((a) => ({ ...a, telegram: `@${a.id}` }));
const payA = { lat: (d: any) => d.lat, lng: (d: any) => d.lng, address: (d: any) => d.id, qty: (d: any) => d.qty };
const pf = computeDayPay('2026-11-04', dayItems, payA, (d: any) => d.telegram, K, 1, ST, null, DEFAULT_PAY)[0];
const pn = computeDayPay('2026-11-04', dayItems, payA, (d: any) => d.telegram, K, 1, DEFAULT_TRIP_SETTINGS, null, DEFAULT_PAY)[0];
ok(Math.abs(pf.autoKm - Math.round(withF.totalKm * 10) / 10) < 1e-9, `км в ЗП = км до последнего заказа (${pf.autoKm} км), отрезок до дома (${withF.finishKm.toFixed(1)} км) не входит`);
ok(pf.autoAddresses === 7 && pn.autoAddresses === 7, 'адреса те же');
console.log(`   ЗП с финишем: ${pf.total} ₫ (${pf.autoKm} км); без финиша: ${pn.total} ₫ (${pn.autoKm} км)`);

console.log('\n── 2 курьера: финиш только у первого ──');
const C = [...B, mk(at(-6, 3), 2, 'С3'), mk(at(5, -4), 2, 'В2'), mk(at(-2, -6), 2, 'Ю2')];
const pl2 = planDay(C, acc, K, 2, ST);
pl2.couriers.forEach((cr, i) => show(cr, `Курьер ${i + 1}`));
ok(pl2.couriers.length === 2, 'два курьера');
ok(pl2.couriers[0].trips.at(-1)!.toFinish && !pl2.couriers[1].trips.some((t) => t.toFinish) && pl2.couriers[1].finishKm === 0, 'финиш у Курьера 1, у Курьера 2 — без финиша');
ok(dest(pl2.couriers[0].trips.at(-1)!.links.at(-1)!) === fmt(F) && dest(pl2.couriers[1].trips.at(-1)!.links.at(-1)!) !== fmt(F), 'ссылка Курьера 2 до последней точки, не до дома');
ok(pl2.couriers[0].trips.at(-1)!.stops.some((s) => s.stop.items[0].id.startsWith('FPT')) || pl2.couriers[1].trips.some((t) => t.stops.some((s) => s.stop.items[0].id.startsWith('FPT'))), 'точки FPT есть в плане');
const pl2no = planDay(C, acc, K, 2, { ...DEFAULT_TRIP_SETTINGS });
ok(pl2no.couriers.every((cr) => cr.trips.every((t) => !t.toFinish)), 'без финиша — ни у кого');

console.log('\n── настройки ──');
ok(parseTripSettings({ courier_finish_lat: '15.9824019', courier_finish_lng: '108.2603871' }).finish?.lat === 15.9824019, 'finish читается из settings');
ok(parseTripSettings({}).finish === null && parseTripSettings({ courier_finish_lat: '', courier_finish_lng: '' }).finish === null && parseTripSettings({ courier_finish_lat: '50', courier_finish_lng: '10' }).finish === null, 'пусто / вне Дананга — финиша нет');

console.log('\n── отчёт курьеру ──');
const dl = (a: It, n: number) => ({ order_number: `NF-${1000 + n}`, telegram: `@${a.id}`, phone: '+84900000000', address: a.id, hotel: null, comment: null, lat: a.lat, lng: a.lng, place_id: null, qty: a.qty, payment_method: 'qr', total: 190000, firstDay: false, cutlery: false, sub: null, status: 'confirmed' } as any);
try {
  const rep = (buildCourierReport as any)('2026-11-04', A.map(dl), '13:00', '16:00', { kitchen: K, couriers: 1, trip: ST });
  const txt = (Array.isArray(rep) ? rep.join('\n') : String(rep)).replace(/&amp;/g, '&');
  console.log(txt.split('\n').filter((l) => /Финиш|Рейс|Открыть/.test(l)).map((l) => '    ' + l.replace(/<[^>]+>/g, '')).join('\n'));
  ok(/кухня → … → 🏠 Финиш/.test(txt) && /🏠 Финиш: ≈ [\d,]+ км от последней точки \(в ЗП не входит\)/.test(txt), 'в отчёте: ссылка подписана «🏠 Финиш» и показан отрезок до дома');
  ok(txt.includes(`destination=${fmt(F)}`), 'в ссылке последней точкой стоит дом');
} catch (e) { ok(false, 'отчёт: ' + (e as Error).message); }
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки финиша пройдены');
