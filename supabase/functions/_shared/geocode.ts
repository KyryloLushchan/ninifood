import { inDanang } from './danang.ts';

const OK_TYPES = new Set(['street_address', 'premise', 'subpremise', 'route', 'establishment', 'point_of_interest', 'intersection']);

/**
 * Геокодирование адреса текстом (Google Geocoding API, ключ GOOGLE_GEOCODING_KEY — только секрет Supabase).
 * Принимается точка только в пределах Дананга и только «адресного» уровня (улица/дом/заведение — не «город» целиком).
 * Любая ошибка/таймаут/нет ключа → null: заказ из-за геокодинга не ломается.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = Deno.env.get('GOOGLE_GEOCODING_KEY') ?? '';
  const q = address.trim();
  if (!key || !q) return null;
  try {
    const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    u.searchParams.set('address', q);
    u.searchParams.set('region', 'vn');
    u.searchParams.set('language', 'vi');
    u.searchParams.set('bounds', '15.94,108.08|16.14,108.32'); // Дананг (подсказка для выдачи; границы проверяем сами)
    u.searchParams.set('key', key);
    const res = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      console.error('geocode http', res.status);
      return null;
    }
    const data = await res.json();
    if (data.status !== 'OK') {
      if (data.status !== 'ZERO_RESULTS') console.error('geocode status', data.status); // текст адреса в лог не пишем
      return null;
    }
    const r = (data.results ?? []).find((x: any) => inDanang(x?.geometry?.location?.lat, x?.geometry?.location?.lng) && (x.types ?? []).some((t: string) => OK_TYPES.has(t)));
    return r ? { lat: Number(r.geometry.location.lat), lng: Number(r.geometry.location.lng) } : null;
  } catch (e) {
    console.error('geocode failed:', (e as Error).message);
    return null;
  }
}
