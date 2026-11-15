/** Чистая часть рекламных источников (разбор ссылки, first/last с TTL 30 дней): без обращений к окружению, проверяется `tools/ad-check/check.mts`. */
export const SOURCE_RE = /^[a-z0-9-]{1,40}$/;
const UTM_RE = /^[a-z0-9._-]{1,60}$/;
export const SOURCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Touch {
  code: string;
  ts: number;
  utm?: Utm;
}
export interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}
export interface StoredSource {
  first: Touch | null;
  last: Touch | null;
}

/** Код источника из строки запроса (`?s=…`) вместе с utm_*; нет или неверный формат — null. Регистр не важен (приводим к нижнему). */
export function parseSource(search: string): { code: string; utm: Utm } | null {
  const q = new URLSearchParams(search);
  const code = (q.get('s') ?? '').trim().toLowerCase();
  if (!SOURCE_RE.test(code)) return null;
  const utm: Utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const) {
    const v = (q.get(k) ?? '').trim().toLowerCase();
    if (UTM_RE.test(v)) utm[k] = v;
  }
  return { code, utm };
}

const alive = (t: Touch | null | undefined, now: number): t is Touch => !!t && typeof t.code === 'string' && SOURCE_RE.test(t.code) && typeof t.ts === 'number' && now - t.ts < SOURCE_TTL_MS && now >= t.ts - 60_000;

/** Новое состояние: first — прежний, если ещё жив (30 дней), иначе новый код; last — всегда новый код. Нет кода в ссылке — только чистка просроченного. */
export function mergeSource(prev: StoredSource | null, found: { code: string; utm: Utm } | null, now: number): StoredSource {
  const first = alive(prev?.first, now) ? prev!.first : null;
  const last = alive(prev?.last, now) ? prev!.last : null;
  if (!found) return { first, last };
  const touch: Touch = { code: found.code, ts: now, ...(Object.keys(found.utm).length ? { utm: found.utm } : {}) };
  return { first: first ?? touch, last: touch };
}

