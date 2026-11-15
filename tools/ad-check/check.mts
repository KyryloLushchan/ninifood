// Проверка рекламных источников: разбор ссылки, first/last на 30 дней, атрибуция клиентов (первый заказ), воронка.
// Запуск: node --experimental-strip-types tools/ad-check/check.mts   (без БД и сети)
import assert from 'node:assert/strict';
import { mergeSource, parseSource, SOURCE_TTL_MS, type StoredSource } from '../../src/lib/ad-source-core.ts';
import { computeAds, isPaid, type AdOrder } from '../../src/lib/admin/ads.ts';

// ── разбор ссылки ──
assert.deepEqual(parseSource('?lang=uk&s=ub-pin'), { code: 'ub-pin', utm: {} });
assert.deepEqual(parseSource('?s=UB-Pin&utm_source=Insta&utm_medium=cpc&utm_campaign=nov_1&utm_content=a.b'), { code: 'ub-pin', utm: { utm_source: 'insta', utm_medium: 'cpc', utm_campaign: 'nov_1', utm_content: 'a.b' } });
assert.equal(parseSource('?s=bad code'), null);
assert.equal(parseSource('?s=a_b'), null);
assert.equal(parseSource('?s='), null);
assert.equal(parseSource('?s=' + 'a'.repeat(41)), null);
assert.equal(parseSource('?s=' + 'a'.repeat(40))?.code, 'a'.repeat(40));
assert.equal(parseSource('?s=<script>'), null);
assert.deepEqual(parseSource('?s=x1&utm_source=bad value&utm_medium=ok'), { code: 'x1', utm: { utm_medium: 'ok' } });
assert.equal(parseSource('?lang=uk'), null);

// ── first / last, TTL 30 дней ──
const T0 = 1_700_000_000_000;
let st: StoredSource = mergeSource(null, parseSource('?s=aaa'), T0);
assert.equal(st.first?.code, 'aaa'); assert.equal(st.last?.code, 'aaa');
st = mergeSource(st, parseSource('?s=bbb'), T0 + 1000);
assert.equal(st.first?.code, 'aaa'); assert.equal(st.last?.code, 'bbb');
st = mergeSource(st, null, T0 + 2000); // заход без кода — ничего не меняется
assert.equal(st.first?.code, 'aaa'); assert.equal(st.last?.code, 'bbb');
const later = T0 + SOURCE_TTL_MS + 5000; // first (T0) просрочен, last (T0+1000) тоже
let st2 = mergeSource(st, null, later);
assert.equal(st2.first, null); assert.equal(st2.last, null);
st2 = mergeSource(st, parseSource('?s=ccc'), later);
assert.equal(st2.first?.code, 'ccc'); assert.equal(st2.last?.code, 'ccc');
const mid = mergeSource(mergeSource(null, parseSource('?s=aaa'), T0), parseSource('?s=bbb'), T0 + SOURCE_TTL_MS - 1000); // first ещё жив
assert.equal(mid.first?.code, 'aaa'); assert.equal(mid.last?.code, 'bbb');
assert.equal(mergeSource({ first: { code: 'BAD CODE', ts: T0 }, last: null }, null, T0 + 1).first, null); // мусор из localStorage

// ── атрибуция ──
let n = 0;
const ord = (o: Partial<AdOrder> & { created_at: string; telegram: string }): AdOrder => ({
  id: `o${++n}`, phone: null, customer_id: null, status: 'confirmed', type: 'single', payment_method: 'qr', total: 100_000, source_first: null, source_last: null, order_days: [{ delivery_date: '2026-11-20', delivered: false }], ...o,
});
const orders: AdOrder[] = [
  ord({ created_at: '2026-11-01T01:00:00Z', telegram: '@Anna', source_first: 'ub-pin', total: 150_000 }),                              // новый клиент ub-pin
  ord({ created_at: '2026-11-05T01:00:00Z', telegram: 'anna', type: 'subscription', total: 700_000, source_first: 'other' }),      // повтор Anna → всё равно ub-pin (первый заказ)
  ord({ created_at: '2026-11-06T01:00:00Z', telegram: '@bob', phone: '+84901234567', source_last: 'ub-pin', total: 150_000 }),     // source_last, т.к. first нет
  ord({ created_at: '2026-11-08T01:00:00Z', telegram: '@bob_new_nick', phone: '+84 90 123 4567', type: 'subscription', total: 600_000, status: 'new' }), // тот же телефон → повтор Bob, не оплачен
  ord({ created_at: '2026-11-02T01:00:00Z', telegram: '@carl', total: 150_000 }),                                                   // без источника
  ord({ created_at: '2026-11-09T01:00:00Z', telegram: '@carl', source_first: 'ub-pin', total: 150_000 }),                           // повтор без источника у первого заказа → не ub-pin
  ord({ created_at: '2026-11-03T01:00:00Z', telegram: '@dina', source_first: 'ig-1', payment_method: 'cash', total: 150_000 }),      // наличные, первый день не доставлен → не оплачено
  ord({ created_at: '2026-11-04T01:00:00Z', telegram: '@eva', source_first: 'ig-1', status: 'cancelled' }),                          // отменён — не считается
  ord({ created_at: '2026-11-10T01:00:00Z', telegram: '@eva', source_first: 'ig-2', total: 150_000 }),                               // первый НЕотменённый заказ Евы → ig-2
  ord({ created_at: '2026-11-11T01:00:00Z', telegram: '@dina', payment_method: 'cash', total: 150_000, order_days: [{ delivery_date: '2026-11-12', delivered: true }] }), // повтор Dina, наличные доставлены → оплачено
];
const visits = [{ code: 'ub-pin', visits: 10, opens: 4 }, { code: 'ig-1', visits: 3, opens: 0 }, { code: 'lonely', visits: 2, opens: 1 }];
const all = computeAds(orders, visits, null);
const by = (c: string) => all.find((r) => r.code === c)!;
assert.deepEqual(by('ub-pin'), { code: 'ub-pin', visits: 10, opens: 4, orders: 4, paid: 3, subs: 2, revenue: 150_000 + 700_000 + 150_000, newClients: 2, repeatOrders: 2 });
assert.deepEqual(by('ig-1'), { code: 'ig-1', visits: 3, opens: 0, orders: 2, paid: 1, subs: 0, revenue: 150_000, newClients: 1, repeatOrders: 1 });
assert.deepEqual(by('ig-2'), { code: 'ig-2', visits: 0, opens: 0, orders: 1, paid: 1, subs: 0, revenue: 150_000, newClients: 1, repeatOrders: 0 });
assert.deepEqual(by('lonely'), { code: 'lonely', visits: 2, opens: 1, orders: 0, paid: 0, subs: 0, revenue: 0, newClients: 0, repeatOrders: 0 });
assert.equal(all.find((r) => r.code === 'other'), undefined); // источник повторного заказа не создаёт строку
// период: с 06.11 — Anna (повтор 05.11) не входит, Bob новый
const p = computeAds(orders, [], '2026-11-06T00:00:00Z');
assert.deepEqual({ ...p.find((r) => r.code === 'ub-pin')! }, { code: 'ub-pin', visits: 0, opens: 0, orders: 2, paid: 1, subs: 1, revenue: 150_000, newClients: 1, repeatOrders: 1 });
assert.equal(p.find((r) => r.code === 'ig-1')?.newClients, 0);
assert.equal(p.find((r) => r.code === 'ig-1')?.repeatOrders, 1);
// оплата
assert.equal(isPaid(ord({ created_at: '2026-11-01T00:00:00Z', telegram: 'x', status: 'new' })), false);
assert.equal(isPaid(ord({ created_at: '2026-11-01T00:00:00Z', telegram: 'x', status: 'delivered', payment_method: 'other' })), true);
console.log('ad-check: OK');
