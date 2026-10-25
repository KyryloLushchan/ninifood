import { CONTACTS, PRICE_SINGLE, PRICE_SUB } from '@/config/site';
import { supabase } from './supabase';

export interface SiteSettings {
  priceSingle: number;
  priceSub: number;
  telegramUrl: string;
}

/** Значения по умолчанию, пока настройки не загрузились (или если БД недоступна). */
export const DEFAULT_SETTINGS: SiteSettings = {
  priceSingle: PRICE_SINGLE,
  priceSub: PRICE_SUB,
  telegramUrl: CONTACTS.telegramUrl,
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
  return {
    priceSingle: num(m.price_single, DEFAULT_SETTINGS.priceSingle),
    priceSub: num(m.price_subscription, DEFAULT_SETTINGS.priceSub),
    telegramUrl: m.telegram_url || DEFAULT_SETTINGS.telegramUrl,
  };
}
