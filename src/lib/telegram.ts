// Сайт как Telegram Mini App (кнопка «Меню» бота @nini_food_bot и кнопка «🍽 Открыть меню» после /start).
// Скрипт telegram-web-app.js подключается ТОЛЬКО когда сайт открыт внутри Telegram (в адресе параметры запуска tgWebApp…); вне Telegram ничего не меняется.

export interface TgUser {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

const FLAG = 'ninifood.tg';
const USER = 'ninifood.tg.user';
const SCRIPT_URL = 'https://telegram.org/js/telegram-web-app.js';

const hashParams = () => {
  try {
    return new URLSearchParams(window.location.hash.replace(/^#/, ''));
  } catch {
    return new URLSearchParams();
  }
};

/** Пользователь из параметров запуска (`tgWebAppData` → `user` JSON) — доступен сразу, без загрузки скрипта Telegram. */
function userFromHash(): TgUser | null {
  try {
    const data = hashParams().get('tgWebAppData');
    const raw = data ? new URLSearchParams(data).get('user') : null;
    return raw ? (JSON.parse(raw) as TgUser) : null;
  } catch {
    return null;
  }
}

/** Открыт ли сайт внутри Telegram (параметры запуска в адресе; запоминается на сессию — адрес потом может измениться) и кто пользователь. */
export function telegramLaunch(): { inside: boolean; user: TgUser | null } {
  if (typeof window === 'undefined') return { inside: false, user: null };
  const p = hashParams();
  const launched = p.has('tgWebAppData') || p.has('tgWebAppVersion') || p.has('tgWebAppPlatform');
  try {
    if (launched) sessionStorage.setItem(FLAG, '1');
  } catch {}
  let inside = launched;
  try {
    inside = launched || sessionStorage.getItem(FLAG) === '1';
  } catch {}
  if (!inside) return { inside: false, user: null };
  let user = userFromHash();
  try {
    if (user) sessionStorage.setItem(USER, JSON.stringify(user));
    else {
      const saved = sessionStorage.getItem(USER);
      user = saved ? (JSON.parse(saved) as TgUser) : null;
    }
  } catch {}
  return { inside, user };
}

/** Язык сайта по language_code пользователя Telegram (uk → ua); неизвестный — undefined (тогда обычный выбор языка). */
export const telegramLang = (code?: string): 'ua' | 'ru' | 'en' | 'vi' | undefined => {
  const c = (code ?? '').toLowerCase().slice(0, 2);
  return c === 'uk' ? 'ua' : c === 'ru' ? 'ru' : c === 'en' ? 'en' : c === 'vi' ? 'vi' : undefined;
};

/** Ник пользователя Telegram («@name») для автозаполнения; нет ника — пустая строка. */
export const telegramNick = () => {
  const u = telegramLaunch().user?.username;
  return u ? `@${u}` : '';
};

let loading = false;
/** Внутри Telegram: подключить telegram-web-app.js, сообщить «готово», раскрыть окно на всю высоту, отключить закрытие свайпом вниз (у нас вертикальная прокрутка и карусели). Вне Telegram — ничего. */
export function loadTelegramScript(): void {
  if (typeof document === 'undefined' || loading || !telegramLaunch().inside) return;
  loading = true;
  const s = document.createElement('script');
  s.src = SCRIPT_URL;
  s.async = true;
  s.onload = () => {
    const w = (window as unknown as { Telegram?: { WebApp?: Record<string, (...a: unknown[]) => void> & { initDataUnsafe?: { user?: TgUser } } } }).Telegram?.WebApp;
    if (!w) return;
    try {
      w.ready?.();
      w.expand?.();
      w.disableVerticalSwipes?.();
      const u = w.initDataUnsafe?.user;
      if (u) sessionStorage.setItem(USER, JSON.stringify(u));
    } catch {}
  };
  document.head.appendChild(s);
}
