import type { OrderType } from './pricing';

export interface OrderPayload {
  orderId: string;
  type: OrderType;
  days: string[];
  portions: number;
  total: number;
  payment: 'qr' | 'cash';
  contact: {
    telegram: string;
    address: string;
    hotel: string;
    comment: string;
  };
  screenshot: File | null;
  lang: string;
}

/** Заглушка: сюда подключается Telegram-бот / таблица / бэкенд. */
export async function submitOrder(payload: OrderPayload): Promise<{ ok: true }> {
  console.log('[submitOrder]', {
    ...payload,
    screenshot: payload.screenshot
      ? { name: payload.screenshot.name, size: payload.screenshot.size, type: payload.screenshot.type }
      : null,
  });
  return { ok: true };
}

export const generateOrderId = () => `NF-${Math.floor(1000 + Math.random() * 9000)}`;
