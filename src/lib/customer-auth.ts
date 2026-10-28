import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { TELEGRAM_BOT_ID, TELEGRAM_WIDGET_SRC } from '@/config/telegram';

/** Клиент для вошедшего через Telegram: своя сессия (ключ отдельный от админки), права — только через RLS. */
export const customerDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ninifood.customer.auth' },
});

export interface CustomerProfile {
  userId: string;
  telegramUsername: string | null;
  /** +84XXXXXXXXX или null. */
  phone: string | null;
  address: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
}

export async function fetchProfile(): Promise<{ profile: CustomerProfile; vip: boolean } | null> {
  const { data: sess } = await customerDb.auth.getSession();
  if (!sess.session) return null;
  const [{ data: c }, { data: vip }] = await Promise.all([
    customerDb.from('customers').select('user_id, telegram_username, phone, address, place_id, lat, lng').maybeSingle(),
    customerDb.rpc('my_is_vip'),
  ]);
  if (!c) return null;
  return {
    profile: { userId: c.user_id, telegramUsername: c.telegram_username, phone: c.phone, address: c.address, placeId: c.place_id, lat: c.lat, lng: c.lng },
    vip: vip === true,
  };
}

let widgetLoad: Promise<void> | null = null;
function loadWidget(): Promise<void> {
  if ((window as any).Telegram?.Login) return Promise.resolve();
  widgetLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TELEGRAM_WIDGET_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      widgetLoad = null;
      reject(new Error('telegram widget load failed'));
    };
    document.head.appendChild(s);
  });
  return widgetLoad;
}

/** Скрипт можно подгрузить заранее, чтобы popup открылся сразу по клику (иначе блокировщик). */
export const preloadTelegramWidget = () => void loadWidget().catch(() => {});

/** Открывает окно Telegram и возвращает подписанные данные пользователя (false — отмена). Вызывать из обработчика клика. */
export function telegramPopup(lang: string): Promise<Record<string, string | number> | false> {
  const T = (window as any).Telegram;
  if (!T?.Login) return loadWidget().then(() => telegramPopup(lang));
  return new Promise((resolve) => T.Login.auth({ bot_id: TELEGRAM_BOT_ID, request_access: false, lang: lang === 'ua' ? 'uk' : lang }, resolve));
}

/** Данные Telegram → edge-функция tg-auth проверяет подпись → сессия Supabase. */
export async function signInWithTelegram(auth: Record<string, string | number>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tg-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ auth }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.session) throw new Error(data.code ?? 'generic');
  const { error } = await customerDb.auth.setSession(data.session);
  if (error) throw error;
}

export const signOutCustomer = () => customerDb.auth.signOut();
