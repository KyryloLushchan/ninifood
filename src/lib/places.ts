import { DANANG_BOUNDS, GOOGLE_PLACES_KEY, PLACES_MAX_SUGGESTIONS } from '@/config/google';
import type { Lang } from '@/i18n';

export interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export interface PlaceInfo {
  placeId: string;
  /** Текст, который попал в поле «Адрес» (название + адрес). */
  text: string;
  lat: number;
  lng: number;
}

const BASE = 'https://places.googleapis.com/v1';
const API_LANG: Record<Lang, string> = { ua: 'en', ru: 'ru', en: 'en', vi: 'vi' };

/** После 403/429 (квота, ключ) больше не дёргаем API до перезагрузки страницы. */
let disabled = false;

export const newSessionToken = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

function fail(what: string, detail: unknown, status?: number) {
  if (status === 403 || status === 429) disabled = true;
  console.warn(`[places] ${what} failed, address field works as plain text:`, detail);
}

export async function autocomplete(input: string, token: string, lang: Lang, signal: AbortSignal): Promise<Suggestion[]> {
  if (disabled) return [];
  try {
    const res = await fetch(`${BASE}/places:autocomplete`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_KEY },
      body: JSON.stringify({
        input,
        sessionToken: token,
        languageCode: API_LANG[lang],
        includedRegionCodes: ['vn'],
        locationRestriction: { rectangle: DANANG_BOUNDS },
      }),
    });
    if (!res.ok) {
      fail('autocomplete', `HTTP ${res.status}`, res.status);
      return [];
    }
    const data = await res.json();
    return ((data.suggestions ?? []) as any[])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, PLACES_MAX_SUGGESTIONS)
      .map((p) => ({
        placeId: String(p.placeId),
        main: String(p.structuredFormat?.mainText?.text ?? p.text?.text ?? ''),
        secondary: String(p.structuredFormat?.secondaryText?.text ?? ''),
      }));
  } catch (e) {
    if ((e as Error).name !== 'AbortError') fail('autocomplete', e);
    return [];
  }
}

/** Place Details (New) с тем же sessionToken — закрывает сессию (биллится как одна). */
export async function placeDetails(placeId: string, token: string, lang: Lang): Promise<PlaceInfo | null> {
  if (disabled) return null;
  try {
    const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${API_LANG[lang]}&sessionToken=${token}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'formattedAddress,location,displayName' },
    });
    if (!res.ok) {
      fail('details', `HTTP ${res.status}`, res.status);
      return null;
    }
    const d = await res.json();
    const lat = Number(d.location?.latitude);
    const lng = Number(d.location?.longitude);
    const name = String(d.displayName?.text ?? '').trim();
    const addr = String(d.formattedAddress ?? '').trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(name || addr)) return null;
    // Для адресов displayName часто уже входит в formattedAddress — не дублируем.
    const text = name && !addr.toLowerCase().includes(name.toLowerCase()) ? (addr ? `${name}, ${addr}` : name) : addr || name;
    return { placeId, text, lat, lng };
  } catch (e) {
    fail('details', e);
    return null;
  }
}
