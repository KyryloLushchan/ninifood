// Проверка текста отчёта курьеру и сообщения кухне (локально, на выдуманных данных, без Telegram/БД/Google):
//   node --experimental-strip-types tools/trips/check-report.mts
import { buildCourierReport, type ReportDelivery } from '../../supabase/functions/_shared/courier-report.ts';
import { buildKitchenMessage } from '../../supabase/functions/_shared/kitchen-report.ts';
import { DEFAULT_TRIP_SETTINGS as ST, planDay } from '../../supabase/functions/_shared/trips.ts';

const K = { lat: 16.0462726, lng: 108.2356202 };
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const mk = (i: number, over: Partial<ReportDelivery> = {}): ReportDelivery => {
  const a = rnd() * 6.28, d = 1 + rnd() * 9;
  return { order_number: `NF-${3000 + i}`, telegram: `@client_${i}`, phone: '+84900000000', address: `${10 + i} Fake Street, Da Nang`, lat: K.lat + (Math.sin(a) * d) / 111, lng: K.lng + (Math.cos(a) * d) / 107, hotel: null, comment: i % 5 === 0 ? 'Позвонить' : null, payment_method: i % 2 ? 'cash' : 'qr', total: 190000, qty: 1 + (i % 2), cutlery: i % 4 === 0, sub: null, firstDay: true, status: i % 7 === 0 ? 'new' : 'confirmed', ...over };
};
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } };
const items = Array.from({ length: 24 }, (_, i) => mk(i));
// два заказа одного клиента на одном адресе + другой клиент на том же адресе
items.push(mk(100, { address: 'Same House 1', lat: K.lat + 0.03, lng: K.lng + 0.01, telegram: '@same_client' }), mk(101, { address: 'Same House 1', lat: K.lat + 0.03, lng: K.lng + 0.01, telegram: '@same_client' }), mk(102, { address: 'Same House 1', lat: K.lat + 0.03, lng: K.lng + 0.01, telegram: '@other_client' }));
items.push(mk(200, { lat: null, lng: null, address: 'No coords' }));
const total = items.reduce((s, d) => s + d.qty, 0);
const pending = items.filter((d) => d.status === 'new').length;

for (const couriers of [1, 2] as const) {
  const msgs = buildCourierReport('2026-11-03', items, '13:00', '16:00', { kitchen: K, couriers, trip: ST });
  console.log(`\n━━ отчёт, курьеров ${couriers}: сообщений ${msgs.length}, длины ${msgs.map((m) => m.length).join(', ')}`);
  const text = msgs.join('\n');
  ok(msgs.every((m) => m.length <= 4096), 'сообщение длиннее 4096');
  for (const d of items) ok(text.includes(d.order_number) || text.includes(d.order_number.replace('NF-', '')), `заказ ${d.order_number} не попал в отчёт`);
  ok((text.match(/Не подтверждён/g) ?? []).length === pending - (pending > 0 && items.filter((d) => d.status === 'new' && d.lat == null).length ? 0 : 0), `⏳: ожидалось ${pending}, в тексте ${(text.match(/Не подтверждён/g) ?? []).length}`);
  ok(text.includes('NF-3100 + NF-3101'), 'заказы одного клиента на одном адресе не объединены');
  ok(/<b>\d+\.1\. NF-3100 \+ NF-3101/.test(text) && /<b>\d+\.2\. NF-3102/.test(text), 'нумерация объединённого адреса должна быть N.1 / N.2');
  ok(text.includes('Без точки на карте'), 'нет блока «без точки»');
  ok(!/<b>\d+\.\d+\. NF-3000</.test(text), 'лишняя подномерация');
  ok((text.match(/🚚 <b>Рейс/g) ?? []).length >= 2, 'нет рейсов');
  ok(/<a href="[^"]+">/.test(text) && (text.match(/<b>/g) ?? []).length === (text.match(/<\/b>/g) ?? []).length, 'теги');
  if (couriers === 2) {
    const i1 = msgs.findIndex((m) => m.includes('🛵 <b>Курьер 1'));
    const i2 = msgs.findIndex((m) => m.includes('🛵 <b>Курьер 2'));
    ok(i1 >= 0 && i2 > i1 && msgs[i2].startsWith('🛵 <b>Курьер 2'), 'блок курьера 2 должен начинаться с нового сообщения');
    ok(!msgs.some((m) => m.includes('Курьер 1</b>') && m.includes('Курьер 2</b>')), 'блоки курьеров в одном сообщении');
    ok(msgs.slice(i1, i2).some((m) => m.includes('google.com/maps/dir')), 'ссылки маршрута курьера 1 должны быть в его блоке');
    ok(msgs.slice(i2).some((m) => m.includes('google.com/maps/dir')), 'ссылки маршрута курьера 2 должны быть в его блоке');
  }
  if (couriers === 1) console.log(msgs.slice(0, 2).join('\n\n─────\n\n').replace(/<[^>]+>/g, '').slice(0, 1800));
  const plan = planDay(items, { lat: (d) => d.lat, lng: (d) => d.lng, address: (d) => d.address, qty: (d) => d.qty }, K, couriers, ST);
  const trips = plan.couriers.map((c) => c.trips.map((t) => ({ portions: t.portions, pending: t.stops.reduce((n, s) => n + s.stop.items.filter((x) => x.status === 'new').reduce((a, x) => a + x.qty, 0), 0) })));
  const k = buildKitchenMessage('2026-11-03', total, 2, items.filter((d) => d.cutlery).length, trips, plan.noPoint.reduce((n, d) => n + d.qty, 0));
  console.log('\nКухне:\n' + k.replace(/<[^>]+>/g, ''));
  const sumTrips = trips.flat().reduce((n, t) => n + t.portions, 0);
  ok(sumTrips + plan.noPoint.reduce((n, d) => n + d.qty, 0) === total, 'порции по рейсам + без точки ≠ всего');
}
const empty = buildCourierReport('2026-11-03', [], '13:00', '16:00', { kitchen: K, couriers: 1, trip: ST });
ok(empty.length === 1 && empty[0].includes('доставок нет'), 'пустой день');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки отчёта пройдены');
