import { errMsg, isChatIdError, redact } from './redact.ts';

const API = (method: string) => `https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/${method}`;

export interface TgResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
}

const NET_ATTEMPTS = 3;
const NET_TIMEOUT_MS = 10_000;
const NET_PAUSE_MS = 1_000;

/**
 * Вызов Bot API. Сетевые сбои (connection reset, timeout, обрыв до ответа) повторяются до 3 раз с паузой 1 с, 2 с; ответы Telegram (ok:false) не повторяются.
 * Ошибки наружу не отдают токен: description пропущен через redact (Deno кладёт URL с токеном в текст fetch-ошибки).
 * FormData (фото) повторяется как есть. Важно: после обрыва ответа сообщение могло уже дойти — редкий дубль возможен.
 */
export async function tg<T = any>(method: string, body: Record<string, unknown> | FormData): Promise<TgResult<T>> {
  const isForm = body instanceof FormData;
  let last = '';
  for (let attempt = 1; attempt <= NET_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(API(method), {
        method: 'POST',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(NET_TIMEOUT_MS),
      });
      const out = await res.json();
      if (typeof out?.description === 'string') out.description = redact(out.description);
      return out;
    } catch (e) {
      last = errMsg(e);
      console.error(`telegram ${method} network error (attempt ${attempt}/${NET_ATTEMPTS}):`, last);
      if (attempt < NET_ATTEMPTS) await new Promise((r) => setTimeout(r, NET_PAUSE_MS * attempt));
    }
  }
  return { ok: false, description: `network error: ${last}` };
}

/** Хвост предупреждения про chat_id/супергруппу — только если причина в чате; иначе пусто. */
export const chatHint = (description: string | undefined | null, envName: string) => (isChatIdError(description) ? ` Если группа стала супергруппой, обновите ${envName}.` : '');

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
