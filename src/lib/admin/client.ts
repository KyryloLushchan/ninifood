import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';

/** Клиент админки: anon key + сессия админа (JWT), все права — только через RLS. */
export const adminDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ninifood.admin.auth' },
});

export type OrderStatus = 'new' | 'confirmed' | 'delivered' | 'cancelled';

export interface OrderDay {
  id: number;
  delivery_date: string;
  qty: number;
  delivered: boolean;
}

export interface AdminOrder {
  id: string;
  order_number: string;
  created_at: string;
  type: 'single' | 'subscription';
  telegram: string;
  address: string;
  hotel: string | null;
  comment: string | null;
  payment_method: 'qr' | 'cash';
  qty: number;
  total: number;
  status: OrderStatus;
  lang: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  tg_message_id: number | null;
  receipt_file_id: string | null;
  order_days: OrderDay[];
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};
