// Фиксированные данные для скриншотов (даты — вокруг 29.10.2026, «сегодня» заморожено в shoot.cjs).
const fs = require('fs');
const path = require('path');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const mkSession = (id, email) => {
  const exp = 1924992000; // 2031-01-01
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, email, aud: 'authenticated', role: 'authenticated', exp })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_in: 99999999, expires_at: exp, token_type: 'bearer', user: { id, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } };
};
exports.customerSession = mkSession('c1', 'anna.test@example.com');
exports.adminSession = mkSession('a1', 'admin@example.com');

const days = (id0, list, delivered = []) => list.map((d, i) => ({ id: id0 + i, delivery_date: d, qty: 2, delivered: delivered.includes(i) }));
const ord = (n, o, d) => ({
  id: 'o' + n, order_number: 'NF-10' + n, created_at: `2026-10-28T0${n % 9}:15:00Z`, type: 'single', telegram: '@guest' + n, phone: '+8490123456' + (n % 10),
  address: `${n} Bạch Đằng, Hải Châu, Đà Nẵng`, lat: 16.05 + n / 500, lng: 108.22 + n / 700, place_id: null, hotel: n % 2 ? 'Hotel Sun' : null, comment: n % 3 ? 'Позвонить за 10 минут' : null,
  payment_method: ['qr', 'cash', 'other'][n % 3], qty: 2, total: 360000, delivery_total: 40000, discount_percent: 0, discount_amount: 0, status: 'confirmed', lang: 'ru',
  status_changed_at: null, status_changed_by: null, tg_message_id: 100 + n, receipt_file_id: null, is_vip: false, order_days: [], ...o, order_days: d,
});
const ORDERS = [
  ord(20, { type: 'single' }, days(1, ['2026-10-29'])),
  ord(21, { type: 'subscription', total: 1700000, delivery_total: 200000 }, days(10, ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02'], [0, 1])),
  ord(22, { type: 'subscription', status: 'new', total: 1700000, delivery_total: 200000 }, days(20, ['2026-10-30', '2026-10-31', '2026-11-02', '2026-11-03', '2026-11-04'])),
  ord(23, { type: 'subscription', total: 1500000, delivery_total: 200000, discount_percent: 30, discount_amount: 225000 }, days(30, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'], [0, 1, 2])),
  ord(24, { type: 'single', status: 'delivered' }, days(40, ['2026-10-27'], [0])),
  ord(25, { type: 'single', status: 'new', lat: null, lng: null }, days(50, ['2026-10-29'])),
  ord(26, { type: 'subscription', total: 1700000 }, days(60, ['2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28'], [0, 1, 2, 3, 4])),
  ord(27, { type: 'single', tg_message_id: null }, days(70, ['2026-10-30'])),
];
const courierRows = ORDERS.filter((o) => ['confirmed', 'new'].includes(o.status)).flatMap((o) =>
  o.order_days.filter((d) => d.delivery_date === '2026-10-29').map((d) => ({ ...d, orders: { ...o, order_days: o.order_days.map((x) => ({ delivery_date: x.delivery_date })) } })),
);

const SETTINGS_ALL = [...fx('settings.json'), { key: 'kitchen_address', value: '90 Nguyễn Tư Giản, Ngũ Hành Sơn, Đà Nẵng 550000' }, { key: 'kitchen_lat', value: '16.0462726' }, { key: 'kitchen_lng', value: '108.2356202' }, { key: 'couriers_count', value: '1' }];
const CATS = [{ id: 1, type: 'out', name: 'Продукты', sort: 1, is_active: true }, { id: 2, type: 'out', name: 'Упаковка', sort: 2, is_active: true }, { id: 3, type: 'in', name: 'Наличные из кассы', sort: 1, is_active: true }];
const CASH = [{ id: 1, date: '2026-10-28', type: 'out', category_id: 1, amount: 450000, comment: 'Рынок' }, { id: 2, date: '2026-10-29', type: 'in', category_id: 3, amount: 1140000, comment: 'Наличные' }];
const MY_ORDERS = [
  { order_number: 'NF-1031', created_at: '2026-10-28T08:00:00Z', type: 'subscription', total: 1500000, status: 'confirmed', order_days: [{ delivery_date: '2026-10-29' }, { delivery_date: '2026-10-30' }, { delivery_date: '2026-10-31' }, { delivery_date: '2026-11-02' }, { delivery_date: '2026-11-03' }] },
  { order_number: 'NF-1012', created_at: '2026-10-20T08:00:00Z', type: 'single', total: 190000, status: 'delivered', order_days: [{ delivery_date: '2026-10-21' }] },
  { order_number: 'NF-1009', created_at: '2026-10-18T08:00:00Z', type: 'single', total: 190000, status: 'cancelled', order_days: [{ delivery_date: '2026-10-19' }] },
];
const CUSTOMER = { user_id: 'c1', email: 'anna.test@example.com', telegram: '@anna_test', phone: '+84901234567', address: '12 Bạch Đằng, Hải Châu, Đà Nẵng', place_id: null, lat: null, lng: null };
const DRAFT = (payment) => ({ type: 'single', days: ['2026-10-30'], portions: 2, payment, lang: null, telegram: '@ninitest', phone: '+84901234567', address: '12 Bạch Đằng, Hải Châu, Đà Nẵng', hotel: 'Hotel Sun', comment: 'Позвонить за 10 минут', place_id: null, lat: null, lng: null });

const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="640" viewBox="0 0 540 640"><rect width="540" height="640" fill="#fff"/><g fill="#000">' +
  Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => ((x * 7 + y * 13 + x * y) % 3 === 0 ? `<rect x="${60 + x * 20}" y="${40 + y * 20}" width="20" height="20"/>` : '')).join('')).join('') +
  '</g><text x="270" y="600" font-family="Arial" font-size="28" text-anchor="middle">TEST QR</text></svg>';

/** Ответ на запрос к Supabase/внешним сервисам; null — пропустить в сеть. mode: site | admin. */
exports.respond = (req, state) => {
  const u = req.url();
  const ok = (body, status = 200, type = 'application/json') => ({ status, contentType: type, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (/img\.vietqr\.io/.test(u)) return ok(QR_SVG, 200, 'image/svg+xml');
  if (/challenges\.cloudflare\.com/.test(u)) return ok('', 200, 'text/javascript');
  if (/places\.googleapis\.com/.test(u)) return ok({ suggestions: [] });
  if (!/supabase\.co/.test(u)) return null;
  if (req.method() === 'OPTIONS') return { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } };
  if (/functions\/v1\/order-draft/.test(u)) {
    const body = JSON.parse(req.postData() || '{}');
    if (body.action === 'create') return ok({ ok: true, id: 'AbCdEfGhIjKlMnOpQrStUv' });
    return state.draft ? ok({ ok: true, draft: DRAFT(state.draft) }) : ok({ ok: false, code: 'not_found' }, 404);
  }
  if (/functions\/v1\/send-order/.test(u)) return ok({ ok: true, orderNumber: 'NF-9999' });
  if (/functions\/v1\/(auth-gate|resolve-point|daily-report|delete-order)/.test(u)) return ok({ ok: false, code: 'locked' }, 429);
  if (/rpc\/is_admin/.test(u)) return ok(state.mode === 'admin');
  if (/rpc\/my_is_vip/.test(u)) return ok(false);
  if (/rpc\/my_discount/.test(u)) return ok(state.discount || 0);
  if (/auth\/v1/.test(u)) return ok({}, 200);
  if (req.method() !== 'GET') return ok('', 204);
  const wantsObject = /pgrst\.object/.test(req.headers()['accept'] || '');
  if (/rest\/v1\/menu_dishes/.test(u)) return ok(fx('menu_dishes.json'));
  if (/rest\/v1\/settings/.test(u)) return ok(state.mode === 'admin' ? SETTINGS_ALL : fx('settings.json'));
  if (/rest\/v1\/customers/.test(u)) return wantsObject ? ok(CUSTOMER) : ok([CUSTOMER]);
  if (/rest\/v1\/order_days/.test(u)) return ok(courierRows);
  if (/rest\/v1\/orders/.test(u)) return ok(state.mode === 'admin' ? ORDERS : MY_ORDERS);
  if (/rest\/v1\/cash_categories/.test(u)) return ok(CATS);
  if (/rest\/v1\/cash_movements/.test(u)) return ok(CASH);
  if (/rest\/v1\/(vip_customers|customer_discounts)/.test(u)) return ok([]);
  return ok([]);
};
