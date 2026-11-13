import { errMsg } from './redact.ts';
import { geocodeAddress, reverseGeocode } from './geocode.ts';
import { inDanang } from './danang.ts';
import { isGoogleHost, parsePoint } from './point.ts';

const MAX_HOPS = 5;

/** Первая ссылка на Google Maps (maps.app.goo.gl, goo.gl/maps, google.*), найденная в тексте; иначе null. Другие ссылки не трогаем. */
export function findMapsUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' && isGoogleHost(u.hostname) && (/maps|goo\.gl/i.test(u.hostname) || /^\/maps/i.test(u.pathname) || u.searchParams.has('q'))) return url;
    } catch { /* не ссылка */ }
  }
  return null;
}

/** Текстовый адрес из параметра q/query/destination ссылки (не «lat,lng»). */
function queryText(url: string): string | null {
  try {
    const u = new URL(url);
    for (const k of ['q', 'query', 'destination']) {
      const v = (u.searchParams.get(k) ?? '').trim();
      if (v && !/^-?\d{1,3}\.\d+\s*[,;\s]\s*-?\d{1,3}\.\d+$/.test(v)) return v.slice(0, 250);
    }
  } catch { /* пусто */ }
  return null;
}

/**
 * Разворачивает ссылку Google Maps (в т.ч. короткую): переходы только по https и google-доменам (защита от SSRF), до 5 шагов, общий таймаут.
 * Возвращает координаты (только Дананг), если они есть в ссылке/редиректах, и текст адреса из `?q=` (короткие ссылки часто ведут на `maps.google.com?q=<адрес>` без координат).
 */
export async function expandMapsLink(input: string): Promise<{ point: { lat: number; lng: number } | null; query: string | null }> {
  let point = parsePoint(input);
  let query = queryText(input);
  let url = input;
  const deadline = Date.now() + 8000;
  try {
    for (let hop = 0; hop < MAX_HOPS && !point; hop++) {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !isGoogleHost(u.hostname) || Date.now() > deadline) break;
      const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(3500), headers: { 'user-agent': 'Mozilla/5.0 (compatible; NiniFood/1.0)' } });
      const loc = res.headers.get('location');
      if (loc) {
        url = new URL(loc, u).toString();
        point = parsePoint(url);
        query = queryText(url) ?? query;
        continue;
      }
      const m = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec((await res.text()).slice(0, 500_000));
      point = m ? parsePoint(`@${m[1]},${m[2]}`) : null;
      break;
    }
  } catch (e) {
    console.error('maps link expand failed:', errMsg(e));
  }
  return { point, query };
}

export interface ResolvedPoint {
  address: string;
  lat: number | null;
  lng: number | null;
  /** true — в адресе была ссылка Google Maps. */
  fromLink: boolean;
}

/**
 * Точка для адреса без координат из подсказки. Если в адресе ссылка Google Maps: раскрываем её, берём координаты (или геокодируем текст из `?q=`),
 * адрес заменяем на человеческий (обратное геокодирование; не получилось — текст из ссылки, иначе исходный). Без ссылки — обычное геокодирование текста.
 * Ничего не получилось — lat/lng = null, адрес как есть: заказ из-за этого не отклоняется.
 */
export async function resolveOrderPoint(address: string): Promise<ResolvedPoint> {
  const url = findMapsUrl(address);
  if (!url) {
    const g = await geocodeAddress(address);
    return { address, lat: g?.lat ?? null, lng: g?.lng ?? null, fromLink: false };
  }
  const rest = address.replace(url, ' ').replace(/\s+/g, ' ').trim();
  const { point, query } = await expandMapsLink(url);
  let pt = point;
  if (!pt && query) pt = await geocodeAddress(query);
  if (!pt && rest.length >= 5) pt = await geocodeAddress(rest);
  if (!pt || !inDanang(pt.lat, pt.lng)) return { address, lat: null, lng: null, fromLink: true };
  const human = (await reverseGeocode(pt.lat, pt.lng)) ?? query ?? null;
  const next = human ? (rest.length >= 3 ? `${human} — ${rest}` : human) : address;
  return { address: next.slice(0, 300), lat: pt.lat, lng: pt.lng, fromLink: true };
}
