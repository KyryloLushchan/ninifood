import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';

export interface GateSession {
  access_token: string;
  refresh_token: string;
}
export type GateResult = { ok: true; session?: GateSession } | { ok: false; code: string };

/** Вход/регистрация/сброс пароля — только через edge-функцию auth-gate (Turnstile, лимиты, пауза после неудач). */
export async function callGate(body: {
  action: 'signin' | 'signup' | 'reset_request' | 'reset_confirm';
  email: string;
  password?: string;
  token?: string;
  captcha: string;
}): Promise<GateResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, session: data.session };
    return { ok: false, code: typeof data.code === 'string' ? data.code : 'generic' };
  } catch {
    return { ok: false, code: 'network' };
  }
}
