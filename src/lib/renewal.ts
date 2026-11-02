import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';

/** Данные для продления подписки по коду из ссылки (?r=КОД). Телефон — только в маске; полный номер подставит сервер. */
export interface Renewal {
  telegram: string;
  /** «32 *** 71» (после +84) или null. */
  phone_hint: string | null;
  address: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  hotel: string;
  comment: string;
  cutlery: boolean;
  lang: string | null;
  portions: number;
}

export const RENEWAL_RE = /^[0-9A-Za-z]{22}$/;

/** null — неверный/просроченный/использованный код или сеть (сайт тогда открывается как обычно, без ошибок). */
export async function fetchRenewal(code: string): Promise<Renewal | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/order-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'renewal_get', code }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok && data.renewal ? (data.renewal as Renewal) : null;
  } catch {
    return null;
  }
}
