import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { PHONE_PREFIX } from './phone';
import type { PlaceInfo } from './places';
import type { OrderType } from './pricing';

export interface OrderPayload {
  type: OrderType;
  days: string[];
  portions: number;
  payment: 'qr' | 'cash' | 'other';
  contact: {
    telegram: string;
    /** Национальные цифры (9), без +84. */
    phone: string;
    address: string;
    hotel: string;
    comment: string;
  };
  /** Место, выбранное в подсказках Google; null — адрес свободным текстом. */
  place: PlaceInfo | null;
  /** Токен Cloudflare Turnstile. */
  captcha: string | null;
  /** Уже сжатый JPEG; обязателен при оплате QR. */
  screenshot: File | null;
  lang: string;
  /** JWT вошедшего через Telegram (сервер берёт из него ник и VIP); null — гость. */
  accessToken?: string | null;
}

/** Код ошибки от сервера (или 'network' / 'generic') — фронт превращает в текст на языке клиента. */
export class OrderError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Отправка заказа в edge-функцию send-order (Supabase).
 * Сумму и номер заказа определяет сервер; здесь они не передаются.
 */
export async function submitOrder(payload: OrderPayload): Promise<{ orderNumber: string }> {
  const form = new FormData();
  form.set(
    'payload',
    JSON.stringify({
      type: payload.type,
      days: payload.days,
      portions: payload.portions,
      payment: payload.payment,
      lang: payload.lang,
      captcha: payload.captcha,
      ...payload.contact,
      phone: `${PHONE_PREFIX}${payload.contact.phone}`,
      ...(payload.place ? { place_id: payload.place.placeId, lat: payload.place.lat, lng: payload.place.lng } : {}),
    }),
  );
  if (payload.screenshot) form.set('screenshot', payload.screenshot, payload.screenshot.name);

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/send-order`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${payload.accessToken ?? SUPABASE_ANON_KEY}` },
      body: form,
    });
  } catch {
    throw new OrderError('network');
  }
  let data: { ok?: boolean; code?: string; orderNumber?: string } = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data.ok || !data.orderNumber) throw new OrderError(data.code ?? 'generic');
  return { orderNumber: data.orderNumber };
}
