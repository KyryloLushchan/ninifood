// Сообщение о заказе в Orders и уведомления — на языке заказа (без БД и Telegram):
//   node --experimental-strip-types tools/order-text-check/check.mts
import { buildOrderText, keyboardNew, keyboardConfirmed, type OrderRow } from '../../supabase/functions/_shared/order-text.ts';
import { dict, diffLine, statusLabel } from '../../supabase/functions/_shared/order-i18n.ts';

let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };
const base: OrderRow = { order_number: 'NF-1099', type: 'subscription', telegram: '@nini_client', phone: '+84901234567', address: '12 Bach Dang, Hai Chau', place_id: 'PID', lat: 16.06, lng: 108.22, hotel: 'Hotel Sun', comment: 'Call me', payment_method: 'qr', qty: 2, total: 1_620_000, delivery_total: 100_000, discount_percent: 10, discount_amount: 150_000, lang: 'ru', cutlery: true, is_vip: false };
const days = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-10'];
const strip = (t: string) => t.replace(/<[^>]+>/g, '');
for (const lang of ['ru', 'ua', 'en', 'vi']) {
  console.log(`\n━━ ${lang.toUpperCase()} ━━`);
  const text = buildOrderText({ ...base, lang }, days, `${statusLabel('confirmed', lang)} — @boss, 03.11 21:00`);
  console.log(strip(text).split('\n').map((l) => '   ' + l).join('\n'));
  ok(!/Язык|Language|Ngôn ngữ|Мова|🌐/.test(text) && !/\b(RU|UA|EN|VI)\b$/m.test(strip(text)), `${lang}: строки с языком нет`);
  if (lang === 'en' || lang === 'vi') ok(!/Заказ|Тип|Дни|Порций|Приборы|Обеды|Доставка|Итого|Оплата|Адрес|Отель|Комментарий|Подписка|Спасибо|открыть|Карта/.test(text.replace(/Hotel Sun|Call me/g, '')), `${lang}: русских подписей в тексте нет`);
}
const t = (l: string | null) => buildOrderText({ ...base, lang: l }, days);
ok(t(null) === t('ru') && t('xx') === t('ru'), 'нет языка / неизвестный → русский');
const one = buildOrderText({ ...base, lang: 'en', type: 'single', discount_amount: 0, cutlery: false, payment_method: 'cash', hotel: null, comment: null, lat: null, lng: null }, ['2026-11-04']);
console.log('\n━━ EN, разовый, наличные ━━\n' + strip(one).split('\n').map((l) => '   ' + l).join('\n'));
ok(/Type: One-time/.test(one) && /Payment: cash — to collect: <b>/.test(one), 'EN разовый и наличные');
const five = buildOrderText({ ...base, lang: 'vi' }, days.slice(0, 5));
ok(/Gói 5 ngày/.test(five) && /Gói 5 ngày \+ 1 ngày thêm \(tổng 6\)/.test(t('vi')), 'VI подписка 5 и 5+доп');
const kb = JSON.stringify([keyboardNew('NF-1'), keyboardConfirmed('NF-1')]);
ok(kb.includes('✅ Подтвердить') && kb.includes('❌ Отклонить') && kb.includes('↩️ Отменить'), 'кнопки управления — по-русски, как раньше');
console.log('\n━━ уведомления ━━');
for (const l of ['ru', 'ua', 'en', 'vi']) {
  const d = dict(l);
  const p = d.portionsChanged('NF-1099', 2, 3, diffLine(150_000, '150 000 ₫', l));
  const r = d.portionsChanged('NF-1099', 3, 2, diffLine(-150_000, '-150 000 ₫', l));
  const a = d.addressChanged('NF-1099', 'Old street', 'New street');
  console.log(`   [${l}] ${p}\n        ${r}\n        ${diffLine(0, '', l)}\n        ${a}`);
  ok(p.includes('NF-1099') && a.includes('New street'), `${l}: уведомления об изменении порций и адреса`);
}
ok(!/порций|Изменён|доплата|возврат/.test(dict('en').portionsChanged('N', 1, 2, diffLine(1, '1', 'en')) + dict('vi').addressChanged('N', 'a', 'b')), 'EN/VI уведомления без русских слов');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки текстов заказа пройдены');
