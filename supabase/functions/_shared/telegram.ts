const API = (method: string) => `https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/${method}`;

export interface TgResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
}

/** Ошибки наружу не отдаём токен: URL с токеном в сообщения не попадает. */
export async function tg<T = any>(method: string, body: Record<string, unknown> | FormData): Promise<TgResult<T>> {
  const isForm = body instanceof FormData;
  try {
    const res = await fetch(API(method), {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: `network error: ${(e as Error).message}` };
  }
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
