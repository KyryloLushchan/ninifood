import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { mergeSource, parseSource, SOURCE_RE, type StoredSource, type Utm } from './ad-source-core';

/**
 * Рекламные ссылки: ?s=код (+ utm_source/utm_medium/utm_campaign/utm_content). Код — только ^[a-z0-9-]{1,40}$, остальное игнорируется.
 * Первый (first) и последний (last) источник хранятся в localStorage 30 дней и уходят в заказ (`source_first`/`source_last`);
 * визиты («visit» — заход с кодом, «checkout_open» — открыта форма заказа) пишутся анонимно в `ad_visits` (anon — только INSERT; «order_created» пишет сервер).
 * Всё best effort: любая ошибка хранилища/сети молча игнорируется, сайт работает как раньше.
 */
const KEY = 'ninifood.ad-source';
const VISITOR_KEY = 'ninifood.visitor-id';

function read(): StoredSource | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSource) : null;
  } catch {
    return null;
  }
}

/** Актуальные коды для заказа (первый и последний) из localStorage; просроченные не возвращаем. */
export function currentSources(now = Date.now()): { first: string | null; last: string | null } {
  const s = mergeSource(read(), null, now);
  return { first: s.first?.code ?? null, last: s.last?.code ?? null };
}

/** Анонимный id посетителя (случайный, в localStorage). */
export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

type Step = 'visit' | 'checkout_open';

function send(code: string, step: Step, utm?: Utm) {
  const vid = visitorId();
  if (!vid) return;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/ad_visits`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ code, visitor_id: vid, step, page: (location.pathname || '/').slice(0, 200), ...(utm ?? {}) }),
    }).catch(() => {});
  } catch {
    /* без паники */
  }
}

/** Один раз за вкладку/сессию на пару «шаг+код» (повторы с сервера всё равно отсекаются защитой от спама). */
function once(step: Step, code: string): boolean {
  try {
    const k = `ninifood.ad-sent:${step}:${code}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, '1');
  } catch {
    /* sessionStorage недоступен — шлём, сервер отсечёт дубль */
  }
  return true;
}

/** Вызывать при загрузке сайта: читает ?s=, обновляет first/last и пишет визит. Адрес страницы не меняет (lang и #subscription работают как раньше). */
export function captureSource(): void {
  try {
    const found = parseSource(window.location.search);
    const now = Date.now();
    const next = mergeSource(read(), found, now);
    localStorage.setItem(KEY, JSON.stringify(next));
    if (found && once('visit', found.code)) send(found.code, 'visit', found.utm);
  } catch {
    /* без паники */
  }
}

/** Открыта форма заказа: пишем шаг с последним источником (если он есть). */
export function trackCheckoutOpen(): void {
  try {
    const { last } = currentSources();
    if (last && once('checkout_open', last)) send(last, 'checkout_open');
  } catch {
    /* без паники */
  }
}
