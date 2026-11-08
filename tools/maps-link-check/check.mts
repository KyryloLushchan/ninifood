// Ссылка Google Maps в адресе заказа → точка и адрес (без сети и БД): node --experimental-strip-types tools/maps-link-check/check.mts
import { findMapsUrl, expandMapsLink, resolveOrderPoint } from '../../supabase/functions/_shared/maps-link.ts';

let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };
const env: Record<string, string> = { GOOGLE_GEOCODING_KEY: 'k' };
(globalThis as any).Deno = { env: { get: (k: string) => env[k] } };

// сеть: redirects[url] = куда редиректит; geo — ответы Geocoding
const hits: string[] = [];
let redirects: Record<string, string> = {};
let forward: Record<string, { lat: number; lng: number }> = {};
let reverse: string | null = '19 Vũng Thùng 2, Sơn Trà, Đà Nẵng 50000, Việt Nam';
let throwOnFetch = false;
(globalThis as any).fetch = async (input: any) => {
  const u = new URL(String(input));
  hits.push(u.hostname);
  if (throwOnFetch) throw new Error('network');
  if (u.hostname === 'maps.googleapis.com') {
    if (u.searchParams.has('latlng')) return { ok: true, json: async () => (reverse ? { status: 'OK', results: [{ types: ['street_address'], formatted_address: reverse }] } : { status: 'ZERO_RESULTS', results: [] }) };
    const loc = forward[u.searchParams.get('address') ?? ''];
    return { ok: true, json: async () => (loc ? { status: 'OK', results: [{ types: ['street_address'], geometry: { location: loc } }] } : { status: 'ZERO_RESULTS', results: [] }) };
  }
  const to = redirects[u.toString()] ?? redirects[u.origin + u.pathname];
  return { ok: true, headers: { get: (h: string) => (h.toLowerCase() === 'location' ? to ?? null : null) }, text: async () => '' };
};
const reset = () => { hits.length = 0; redirects = {}; forward = {}; reverse = '19 Vũng Thùng 2, Sơn Trà, Đà Nẵng 50000, Việt Nam'; throwOnFetch = false; };

console.log('── поиск ссылки ──');
ok(findMapsUrl('вот https://maps.app.goo.gl/kzVRUjTfMirppPYk6?g_st=ic.') === 'https://maps.app.goo.gl/kzVRUjTfMirppPYk6?g_st=ic', 'находит короткую ссылку, точка в конце отрезается');
ok(findMapsUrl('https://www.google.com/maps/place/x/@16.0984,108.2335,17z') !== null && findMapsUrl('https://maps.google.com/?q=16.09,108.23') !== null, 'google.com/maps и maps.google.com');
ok(findMapsUrl('https://evil.example.com/maps?q=1') === null && findMapsUrl('12 Bach Dang') === null && findMapsUrl('https://t.me/x') === null, 'чужие ссылки и обычный адрес — не ссылка Google Maps');

console.log('── ссылка с координатами в редиректе ──');
reset();
redirects['https://maps.app.goo.gl/AAA'] = 'https://www.google.com/maps/place/x/@16.0984853,108.2335787,17z/data=!3m1';
let r = await resolveOrderPoint('https://maps.app.goo.gl/AAA');
ok(r.fromLink && r.lat === 16.0984853 && r.lng === 108.2335787, 'координаты из редиректа');
ok(r.address === '19 Vũng Thùng 2, Sơn Trà, Đà Nẵng 50000, Việt Nam', 'адрес — из обратного геокодирования, а не ссылка');

console.log('── короткая ссылка ведёт на ?q=<адрес> без координат (как у клиентов) ──');
reset();
redirects['https://maps.app.goo.gl/kzVRUjTfMirppPYk6'] = 'https://maps.google.com?q=27+V%C5%A9ng+Th%C3%B9ng+2,+S%C6%A1n+Tr%C3%A0,+%C4%90%C3%A0+N%E1%BA%B5ng+550000&ftid=0x1:0x2&entry=gps';
forward['27 Vũng Thùng 2, Sơn Trà, Đà Nẵng 550000'] = { lat: 16.0985, lng: 108.2336 };
r = await resolveOrderPoint('https://maps.app.goo.gl/kzVRUjTfMirppPYk6?g_st=ic');
ok(r.lat === 16.0985 && r.lng === 108.2336, 'координаты — геокодирование текста из ?q=');
ok(r.address.startsWith('19 Vũng Thùng 2'), 'адрес заменён человеческим');

console.log('── текст рядом со ссылкой не теряется ──');
reset();
redirects['https://maps.app.goo.gl/BBB'] = 'https://www.google.com/maps/@16.05,108.22,17z';
r = await resolveOrderPoint('Hotel Sun, комната 12 https://maps.app.goo.gl/BBB');
ok(r.lat === 16.05 && / — Hotel Sun, комната 12$/.test(r.address), 'адрес + пояснение клиента: «… — Hotel Sun, комната 12»');

console.log('── не вышло: заказ всё равно принимается, точки нет ──');
reset(); throwOnFetch = true;
r = await resolveOrderPoint('https://maps.app.goo.gl/CCC');
ok(r.lat === null && r.lng === null && r.fromLink && r.address === 'https://maps.app.goo.gl/CCC', 'сеть упала → без точки, адрес как был');
reset(); redirects['https://maps.app.goo.gl/DDD'] = 'https://www.google.com/maps/@10.77,106.69,17z'; // Хошимин — вне Дананга
r = await resolveOrderPoint('https://maps.app.goo.gl/DDD');
ok(r.lat === null && r.lng === null, 'точка вне Дананга отбрасывается');
reset(); reverse = null; redirects['https://maps.app.goo.gl/EEE'] = 'https://www.google.com/maps/@16.05,108.22,17z';
r = await resolveOrderPoint('https://maps.app.goo.gl/EEE');
ok(r.lat === 16.05 && r.address === 'https://maps.app.goo.gl/EEE', 'точка есть, а адреса от Geocoding нет → точка сохраняется, адрес как ввёл клиент');

console.log('── защита от SSRF ──');
reset(); redirects['https://maps.app.goo.gl/FFF'] = 'https://evil.example.com/steal';
await expandMapsLink('https://maps.app.goo.gl/FFF');
ok(!hits.includes('evil.example.com'), 'редирект на чужой домен не выполняется');
reset(); await expandMapsLink('http://maps.app.goo.gl/GGG');
ok(!hits.includes('maps.app.goo.gl'), 'не https — не открываем');

console.log('── обычный текст ──');
reset(); forward['12 Bach Dang, Hai Chau'] = { lat: 16.07, lng: 108.22 };
r = await resolveOrderPoint('12 Bach Dang, Hai Chau');
ok(!r.fromLink && r.lat === 16.07 && r.address === '12 Bach Dang, Hai Chau', 'без ссылки — прежнее геокодирование текста, адрес не меняется');
reset(); r = await resolveOrderPoint('somewhere');
ok(r.lat === null && !r.fromLink, 'не нашли — без точки');

console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки ссылок Google Maps пройдены');
process.exit(fails ? 1 : 0);
