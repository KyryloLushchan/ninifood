import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';

/** Клиент для вошедшего по email: своя сессия (ключ отдельный от админки), права — только через RLS. */
export const customerDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ninifood.customer.auth' },
});

export interface CustomerProfile {
  userId: string;
  email: string | null;
  /** Ник Telegram, который клиент вводил в оформлении (с @ или без). */
  telegram: string | null;
  /** +84XXXXXXXXX или null. */
  phone: string | null;
  address: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
}

export async function fetchProfile(): Promise<{ profile: CustomerProfile; vip: boolean; discount: number } | null> {
  const { data: sess } = await customerDb.auth.getSession();
  if (!sess.session) return null;
  const [{ data: c }, { data: vip }, { data: disc }] = await Promise.all([
    customerDb.from('customers').select('user_id, email, telegram, phone, address, place_id, lat, lng').maybeSingle(),
    customerDb.rpc('my_is_vip'),
    customerDb.rpc('my_discount'),
  ]);
  if (!c) return null;
  return {
    profile: { userId: c.user_id, email: c.email ?? sess.session.user.email ?? null, telegram: c.telegram, phone: c.phone, address: c.address, placeId: c.place_id, lat: c.lat, lng: c.lng },
    vip: vip === true,
    discount: typeof disc === 'number' && disc > 0 && disc <= 100 ? disc : 0,
  };
}

export const signOutCustomer = () => customerDb.auth.signOut();
