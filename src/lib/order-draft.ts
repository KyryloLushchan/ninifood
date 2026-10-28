import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { BASE_PATH } from './base-path';

/** Черновик заказа (без цены) в формате edge-функции order-draft / send-order. */
export interface DraftPayload {
  type: 'single' | 'subscription';
  days: string[];
  portions: number;
  payment: 'qr' | 'cash' | 'other';
  lang: string | null;
  telegram: string;
  /** +84XXXXXXXXX */
  phone: string;
  address: string;
  hotel: string;
  comment: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
}

export const DRAFT_ID_RE = /^[0-9A-Za-z]{22}$/;

async function call(body: unknown): Promise<{ ok: boolean; code?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/order-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok ? data : { ok: false, code: typeof data.code === 'string' ? data.code : 'generic' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** Возвращает id черновика или код ошибки (для error.*). */
export async function createDraft(draft: Omit<DraftPayload, 'type'> & { type: 'once' | 'sub' }, captcha: string): Promise<{ id: string } | { code: string }> {
  const r = await call({ action: 'create', ...draft, captcha });
  return r.ok && typeof r.id === 'string' ? { id: r.id } : { code: r.code ?? 'generic' };
}

/** null — не найден / истёк / сеть. */
export async function fetchDraft(id: string): Promise<DraftPayload | null> {
  const r = await call({ action: 'get', id });
  return r.ok && r.draft ? (r.draft as DraftPayload) : null;
}

export const draftLink = (id: string) => `${window.location.origin}${BASE_PATH}/?d=${id}`;
