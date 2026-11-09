// «Такси»: план, отчёт курьеру, порции кухне, ЗП (без БД и Telegram): node --experimental-strip-types tools/taxi-check/check.mts
import { planDay, DEFAULT_TRIP_SETTINGS } from '../../supabase/functions/_shared/trips.ts';
import { buildCourierReport, type ReportDelivery } from '../../supabase/functions/_shared/courier-report.ts';
import { buildKitchenMessage } from '../../supabase/functions/_shared/kitchen-report.ts';
import { computeDayPay, parsePaySettings, clientKey } from '../../supabase/functions/_shared/courier-pay.ts';

let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };
const K = { lat: 16.0462726, lng: 108.2356202 };
const at = (e: number, n: number) => ({ lat: K.lat + n / 111, lng: K.lng + e / (111 * Math.cos((K.lat * Math.PI) / 180)) });
const mk = (n: number, nick: string, p: { lat: number; lng: number } | null, o: Partial<ReportDelivery> = {}): ReportDelivery => ({
  order_number: `NF-${n}`, telegram: nick, phone: null, address: `${nick} address`, lat: p?.lat ?? null, lng: p?.lng ?? null, hotel: null, comment: null,
  payment_method: 'qr', total: 190000, qty: 1, sub: null, firstDay: true, status: 'confirmed', dayIds: [n], ...o,
});
const acc = { lat: (d: ReportDelivery) => d.lat, lng: (d: ReportDelivery) => d.lng, address: (d: ReportDelivery) => d.address, qty: (d: ReportDelivery) => d.qty, taxi: (d: ReportDelivery) => d.taxi === true };
const base = [mk(1, '@a', at(-4, 3)), mk(2, '@b', at(5, 4)), mk(3, '@c', at(-8, -2)), mk(4, '@d', at(9, -5))];
const off = mk(5, '@OBRRAZ', at(12, 9), { qty: 2, payment_method: 'cash', address: '19 Vũng Thùng 2, Sơn Trà', phone: '+84383693822', taxi: true });
const strip = (t: string) => t.replace(/<[^>]+>/g, '');

console.log('── план ──');
const without = planDay(base, acc, K, 1, DEFAULT_TRIP_SETTINGS);
const withOff = planDay([...base, off], acc, K, 1, DEFAULT_TRIP_SETTINGS);
ok(withOff.taxi.length === 1 && withOff.taxi[0].order_number === 'NF-5' && without.taxi.length === 0, 'заказ с флагом — в plan.taxi, без флага список пуст');
ok(withOff.couriers[0].totalKm === without.couriers[0].totalKm && withOff.couriers[0].trips.flatMap((t) => t.stops).length === 4, `км и точки как без него: ${withOff.couriers[0].totalKm.toFixed(1)} км, 4 точки`);
ok(!withOff.couriers[0].trips.some((t) => t.links.some((u) => u.includes(String(off.lat).slice(0, 7)))), 'в ссылках маршрута его координат нет');
const only = planDay([off], acc, K, 1, DEFAULT_TRIP_SETTINGS);
ok(only.couriers.length === 0 && only.taxi.length === 1, 'если все заказы дня вне маршрута — рейсов нет, блок остаётся');

console.log('── отчёт курьеру ──');
const rep = buildCourierReport('2026-11-10', [...base, off], '13:00', '16:00', { kitchen: K, couriers: 1, trip: DEFAULT_TRIP_SETTINGS });
const all = rep.map(strip).join('\n\n');
const last = strip(rep[rep.length - 1]).trim().split('\n\n').pop()!;
console.log('   ' + last);
ok(last === '🚕 Такси: @OBRRAZ · 19 Vũng Thùng 2, Sơn Trà · 2 порции · 💵 Взять наличными: 190 000 ₫ · 📞 +84 38 369 38 22', 'последний блок: «🚕 Такси: @ник · адрес · порции · оплата · телефон»');
ok(/<a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=[\d.]+,[\d.]+">19 Vũng Thùng 2, Sơn Trà<\/a>/.test(rep[rep.length - 1]), 'адрес — ссылка на карту (Google Maps)');
ok(!all.slice(0, all.lastIndexOf('🚕 Такси')).includes('OBRRAZ') && /Адресов: 4 · Порций: 4/.test(all), 'в рейсах и итогах отчёта его нет (адресов 4, порций 4)');
const repNoK = buildCourierReport('2026-11-10', [...base, off], '13:00', '16:00');
ok(strip(repNoK.join('\n')).includes('🚕 Такси: @OBRRAZ') && /Адресов: 4/.test(strip(repNoK.join('\n'))), 'без координат кухни (запасной режим) — тоже отдельным блоком, в итогах нет');

console.log('── порции кухне ──');
const total = [...base, off].reduce((n, d) => n + d.qty, 0);
const k0 = buildKitchenMessage('2026-11-10', total, 2, 0, undefined, 0, []);
const k1 = buildKitchenMessage('2026-11-10', total, 2, 0, undefined, 0, [], off.qty);
ok(k0.split('\n')[0] === k1.split('\n')[0] && strip(k1.split('\n')[0]).includes(`${total} + 2 = ${total + 2}`), `порции считаются как обычно: «${strip(k1.split('\n')[0])}» (включая заказ вне маршрута)`);
ok(k1.split('\n').includes('🚕 Такси: 2') && !k0.includes('🚕'), 'строка «🚕 Такси: N» только если такие порции есть');

console.log('── ЗП курьера ──');
const items = [...base, off];
const run = (xs: ReportDelivery[]) => computeDayPay('2026-11-10', xs, acc, (d) => clientKey(d.telegram), K, 1, DEFAULT_TRIP_SETTINGS, null, parsePaySettings({}))[0];
const a = run(items), b = run(base);
ok(a.autoAddresses === 4 && a.autoKm === b.autoKm && a.total === b.total, `адреса и км без заказа вне маршрута: ${a.autoAddresses} адр., ${a.autoKm} км`);

console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки «Такси» пройдены');
process.exit(fails ? 1 : 0);
