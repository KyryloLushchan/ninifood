import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { currentSources, visitorId } from './ad-source';
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
  /** Одноразовые приборы (бесплатно, одно значение на все дни). */
  cutlery?: boolean;
  /** Токен Cloudflare Turnstile. */
  captcha: string | null;
  /** Уже сжатый JPEG; обязателен при оплате QR. */
  screenshot: File | null;
  lang: string;
  /** JWT вошедшего через Telegram (сервер берёт из него ник и VIP); null — гость. */
  accessToken?: string | null;
  /** Черновик «Продолжить на телефоне»: после успешного заказа сервер его удалит. */
  draftId?: string | null;
  /** Код ссылки продления: после заказа сервер гасит ссылку; при keepPhone полный номер подставляется на сервере по коду. */
  renewalCode?: string | null;
  keepPhone?: boolean;
  /** Ключ запроса (uuid): повтор с тем же ключом не создаёт второй заказ. */
  requestId?: string | null;
}

/** Таймаут одной попытки отправки: дольше — считаем сетевой ошибкой и (если остались попытки) повторяем. */
export const SUBMIT_TIMEOUT_MS = 60_000;

/** Код ошибки от сервера (или 'network' / 'generic') — фронт превращает в текст на языке клиента. */
export class OrderError extends Error {
  constructor(
    public code: string,
    /** Для code='network': 'timeout' (60 с без ответа) или имя/текст сбоя fetch; elapsedMs — сколько ждали. */
    public detail?: { kind: 'network' | 'timeout'; err: string; elapsedMs: number },
  ) {
    super(code);
  }
}

/**
 * Отправка заказа в edge-функцию send-order (Supabase).
 * Сумму и номер заказа определяет сервер; здесь они не передаются.
 */
export async function submitOrder(payload: OrderPayload): Promise<{ orderNumber: string }> {
  const form = new FormData();
  const src = currentSources(); // рекламный источник (30 дней в localStorage); нет — поля не отправляем
  const vid = src.first || src.last ? visitorId() : '';
  form.set(
    'payload',
    JSON.stringify({
      type: payload.type,
      days: payload.days,
      portions: payload.portions,
      payment: payload.payment,
      lang: payload.lang,
      captcha: payload.captcha,
      cutlery: payload.cutlery === true,
      ...(src.first ? { source_first: src.first } : {}),
      ...(src.last ? { source_last: src.last } : {}),
      ...(vid ? { visitor_id: vid } : {}),
      ...(payload.draftId ? { draft_id: payload.draftId } : {}),
      ...(payload.renewalCode ? { renewal: payload.renewalCode } : {}),
      ...payload.contact,
      phone: payload.keepPhone && payload.renewalCode ? '' : `${PHONE_PREFIX}${payload.contact.phone}`,
      ...(payload.place ? { place_id: payload.place.placeId, lat: payload.place.lat, lng: payload.place.lng } : {}),
    }),
  );
  if (payload.screenshot) form.set('screenshot', payload.screenshot, payload.screenshot.name);

  const started = Date.now();
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, SUBMIT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/send-order`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${payload.accessToken ?? SUPABASE_ANON_KEY}`,
        ...(payload.requestId ? { 'x-request-id': payload.requestId } : {}),
      },
      body: form,
      signal: ctl.signal,
    });
  } catch (e) {
    const err = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw new OrderError('network', { kind: timedOut ? 'timeout' : 'network', err: timedOut ? 'timeout' : err, elapsedMs: Date.now() - started });
  } finally {
    clearTimeout(timer);
  }
  let data: { ok?: boolean; code?: string; orderNumber?: string } = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data.ok || !data.orderNumber) throw new OrderError(data.code ?? 'generic');
  return { orderNumber: data.orderNumber };
}
