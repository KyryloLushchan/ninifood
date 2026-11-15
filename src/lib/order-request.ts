import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';

/**
 * Ключ запроса отправки заказа (uuid → заголовок x-request-id): один ключ = один заказ на сервере.
 * Повтор после обрыва с тем же ключом возвращает уже созданный заказ (без дубля). Ключ хранится в localStorage 2 часа
 * и переиспользуется, только пока состав заказа тот же (отпечаток); изменили заказ — новый ключ.
 */
const KEY = 'ninifood.order-req';
const TTL_MS = 2 * 3600_000;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

/** Короткий отпечаток состава заказа (не криптография — только «тот же заказ или уже другой»). */
export function fingerprint(parts: unknown): string {
  const s = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export function requestIdFor(fp: string, now = Date.now()): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as { id?: string; fp?: string; t?: number };
      if (o.id && o.fp === fp && typeof o.t === 'number' && now - o.t < TTL_MS) return o.id;
    }
  } catch {
    /* без хранилища — просто новый ключ */
  }
  const id = newId();
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, fp, t: now }));
  } catch {
    /* ок */
  }
  return id;
}

/** Заказ принят — ключ больше не нужен (следующий заказ получит новый). */
export function clearRequestId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ок */
  }
}

// ── Отчёты клиента о сетевых сбоях отправки (без телефона/ника/адреса): анонимный INSERT в order_client_errors, best effort ──
const QUEUE_KEY = 'ninifood.order-errors';
export interface NetReport {
  request_id: string;
  attempt: number;
  kind: 'network' | 'timeout';
  elapsed_ms: number;
  screenshot_bytes: number;
  total: number;
  lang: string;
  err: string;
}

function snapshot(r: NetReport) {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  const tgWebApp = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  return {
    ...r,
    online: navigator.onLine,
    origin: location.origin.slice(0, 100),
    page: (location.pathname || '/').slice(0, 200),
    ua: navigator.userAgent.slice(0, 300),
    conn: (nav.connection?.effectiveType ?? '').slice(0, 20) || null,
    in_telegram: !!tgWebApp,
    err: r.err.slice(0, 120),
  };
}

async function post(rows: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/order_client_errors`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Сохраняем отчёт в очередь (на случай, что сети нет совсем) и пробуем отправить; не отправилось — уйдёт при следующем открытии сайта. */
export async function reportNetworkError(r: NetReport) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as unknown[];
    q.push(snapshot(r));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-5)));
  } catch {
    /* ок */
  }
  await flushNetworkReports();
}

export async function flushNetworkReports() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const q = JSON.parse(raw) as unknown[];
    if (!q.length) return;
    if (await post(q)) localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ок */
  }
}
