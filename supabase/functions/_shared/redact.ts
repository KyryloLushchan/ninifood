/**
 * Вырезание секретов из текстов ошибок и логов. Заменяет токены/ключи на ***:
 *  - значения секретов из окружения функции (имя содержит TOKEN/KEY/SECRET/PASSWORD/DB_URL, длина ≥ 8);
 *  - токен бота Telegram (`123456789:AA…`, `/bot<токен>/`), JWT (`eyJ…`), age-ключи, `key=`/`token=`/`apikey=`/`secret=` в URL, `Bearer …`, пароль в строке подключения `://user:pass@`.
 * Импорт этого модуля (`import '../_shared/redact.ts'`) ставит фильтр на console.log/info/warn/error — в логи функций секреты не попадают, даже если исказится текст ошибки.
 */
const SECRET_ENV = /TOKEN|KEY|SECRET|PASSWORD|DB_URL/i;

function secretValues(): string[] {
  const out: string[] = [];
  try {
    for (const [k, v] of Object.entries(Deno.env.toObject())) if (SECRET_ENV.test(k) && v && v.length >= 8) out.push(v);
  } catch { /* нет доступа к окружению — остаются только шаблоны */ }
  return out.sort((a, b) => b.length - a.length);
}

const PATTERNS: RegExp[] = [
  /\/bot\d{5,}:[A-Za-z0-9_-]{20,}/g,
  /\b\d{5,}:[A-Za-z0-9_-]{30,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /AGE-SECRET-KEY-[A-Z0-9]+/g,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /([?&](?:key|api_?key|token|access_token|secret|apikey)=)[^&\s"')]+/gi,
  /(:\/\/[^\s:/@]+:)[^\s@/]+(@)/g,
];

export function redact(input: unknown): string {
  let s = typeof input === 'string' ? input : input instanceof Error ? input.message : (() => { try { return JSON.stringify(input) ?? String(input); } catch { return String(input); } })();
  for (const v of secretValues()) if (s.includes(v)) s = s.split(v).join('***');
  for (const re of PATTERNS) s = s.replace(re, (m, a, b) => (m.startsWith('/bot') ? '/bot***' : a !== undefined && typeof a === 'string' && re.source.startsWith('([?&]') ? `${a}***` : b === '@' ? `${a}***@` : '***'));
  return s;
}

/** Текст ошибки без секретов (замена `(e as Error).message`). */
export const errMsg = (e: unknown): string => redact(e instanceof Error ? e.message : e);

/** Подсказка про chat_id/супергруппу — только если ошибка Telegram действительно про чат. */
export const isChatIdError = (description: string | undefined | null) => /chat not found|upgraded to a supergroup|migrate_to_chat_id|group chat was (upgraded|deleted)|bot was (kicked|blocked)|not enough rights|have no rights to send/i.test(description ?? '');

declare global { var __redactInstalled: boolean | undefined }
if (!globalThis.__redactInstalled) {
  globalThis.__redactInstalled = true;
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const orig = console[m].bind(console);
    console[m] = (...args: unknown[]) => orig(...args.map((a) => (typeof a === 'string' ? redact(a) : a instanceof Error ? redact(`${a.name}: ${a.message}`) : typeof a === 'object' && a !== null ? redact(a) : a)));
  }
}
