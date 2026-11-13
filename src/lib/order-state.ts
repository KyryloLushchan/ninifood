import type { Contact, Payment, Screen } from '@/state/app-context';
import type { PlaceInfo } from '@/lib/places';

/**
 * Незавершённое оформление заказа в localStorage: клиент мог уйти из сайта (банк, галерея, Telegram) и вернуться — вкладку система перезагружает.
 * Пишется при каждом изменении, живёт 2 часа с последней правки; скриншот не хранится. Стирается после отправки заказа, на «На главную» и при возврате на главную.
 */
export interface OrderSnapshot {
  screen: Screen;
  orderType: 'once' | 'sub';
  autoSub: boolean;
  onceDays: string[];
  subDays: string[] | null;
  portions: number;
  contact: Contact;
  place: PlaceInfo | null;
  cutlery: boolean;
  payment: Payment;
  renewal: { code: string; phoneHint: string | null } | null;
  phoneKept: boolean;
  draftId: string | null;
}

const KEY = 'ninifood.order-state';
export const ORDER_STATE_TTL = 2 * 60 * 60 * 1000;

export function saveOrderState(s: OrderSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), s }));
  } catch {
    /* приватный режим / нет места — оформление просто не переживёт перезагрузку */
  }
}

export function clearOrderState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((d) => typeof d === 'string');

export function loadOrderState(now = Date.now()): OrderSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { v, at, s } = JSON.parse(raw) as { v: number; at: number; s: OrderSnapshot };
    if (v !== 1 || typeof at !== 'number' || now - at > ORDER_STATE_TTL || now < at - 60_000) return null;
    if (!s || !['order', 'checkout', 'payment'].includes(s.screen) || !isStrArr(s.onceDays) || !(s.subDays === null || isStrArr(s.subDays)) || !s.contact || typeof s.contact !== 'object') return null;
    if (!['once', 'sub'].includes(s.orderType) || !['qr', 'cash', 'other'].includes(s.payment) || !Number.isFinite(s.portions)) return null;
    return s;
  } catch {
    return null;
  }
}
