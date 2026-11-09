import type { Contact } from '@/state/app-context';
import type { PlaceInfo } from '@/lib/places';

/** Заказ на экране оплаты, сохранённый перед уходом в приложение банка (та же вкладка; sessionStorage). Скриншот не хранится. */
export interface PaySnapshot {
  orderType: 'once' | 'sub';
  days: string[];
  portions: number;
  contact: Contact;
  place: PlaceInfo | null;
  payment: 'qr' | 'cash' | 'other';
  cutlery: boolean;
  renewal: { code: string; phoneHint: string | null } | null;
  phoneKept: boolean;
  draftId: string | null;
}

const KEY = 'ninifood.pay-session';
const TTL = 30 * 60 * 1000;

export function writePaySession(s: PaySnapshot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), s }));
  } catch {
    /* нет памяти — вернёмся на пустой сайт, как раньше */
  }
}

export function clearPaySession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function readPaySession(): PaySnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { at, s } = JSON.parse(raw) as { at: number; s: PaySnapshot };
    if (!s || Date.now() - at > TTL || !Array.isArray(s.days) || !s.contact) return null;
    return s;
  } catch {
    return null;
  }
}
