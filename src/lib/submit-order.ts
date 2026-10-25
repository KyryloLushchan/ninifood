import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import type { OrderType } from './pricing';

export interface OrderPayload {
  type: OrderType;
  days: string[];
  portions: number;
  payment: 'qr' | 'cash';
  contact: {
    telegram: string;
    address: string;
    hotel: string;
    comment: string;
  };
  /** Уже сжатый JPEG; обязателен при оплате QR. */
  screenshot: File | null;
  lang: string;
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
      ...payload.contact,
    }),
  );
  if (payload.screenshot) form.set('screenshot', payload.screenshot, payload.screenshot.name);

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/send-order`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
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
