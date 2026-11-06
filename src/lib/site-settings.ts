import { CONTACTS, DELIVERY_FROM, DELIVERY_SINGLE, DELIVERY_TO, PRICE_SINGLE, PRICE_SUB } from '@/config/site';
import { supabase } from './supabase';

export interface SiteSettings {
  priceSingle: number;
  priceSub: number;
  deliverySingle: number;
  /** Время доставки «ЧЧ:ММ» (settings.delivery_from / delivery_to). */
  deliveryFrom: string;
  deliveryTo: string;
  telegramUrl: string;
  /** @username из telegramUrl (t.me/username) — для подписи ссылок. */
  telegramHandle: string;
}

export function handleFromUrl(url: string, fallback: string): string {
  const m = /(?:t\.me\/|telegram\.me\/|^@)([A-Za-z0-9_]{4,32})\/?(?:[?#].*)?$/i.exec(url.trim());
  return m ? `@${m[1]}` : fallback;
}

/** Значения по умолчанию, пока настройки не загрузились (или если БД недоступна). */
export const DEFAULT_SETTINGS: SiteSettings = {
  priceSingle: PRICE_SINGLE,
  priceSub: PRICE_SUB,
  deliverySingle: DELIVERY_SINGLE,
  deliveryFrom: DELIVERY_FROM,
  deliveryTo: DELIVERY_TO,
  telegramUrl: CONTACTS.telegramUrl,
  telegramHandle: CONTACTS.telegramHandle,
};

/** Публичные настройки из таблицы settings (anon видит только is_public). */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error || !data) {
    console.error('[fetchSiteSettings]', error);
    return DEFAULT_SETTINGS;
  }
  const m = Object.fromEntries(data.map((r) => [r.key, r.value as string]));
  const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
  const fee = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number(v) >= 0 ? Number(v) : d);
  const time = (v: string | undefined, d: string) => (v && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : d);
  return {
    priceSingle: num(m.price_single, DEFAULT_SETTINGS.priceSingle),
    priceSub: num(m.price_subscription, DEFAULT_SETTINGS.priceSub),
    deliverySingle: fee(m.delivery_single, DEFAULT_SETTINGS.deliverySingle),
    deliveryFrom: time(m.delivery_from, DEFAULT_SETTINGS.deliveryFrom),
    deliveryTo: time(m.delivery_to, DEFAULT_SETTINGS.deliveryTo),
    telegramUrl: m.telegram_url || DEFAULT_SETTINGS.telegramUrl,
    telegramHandle: handleFromUrl(m.telegram_url || '', DEFAULT_SETTINGS.telegramHandle),
  };
}
