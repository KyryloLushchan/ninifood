/** Телефон клиента: префикс +84 фиксирован, вводятся ровно 9 цифр (хранится как +84XXXXXXXXX). */
export const PHONE_PREFIX = '+84';
export const PHONE_DIGITS = 9;

/** Из ввода/вставки — только национальные цифры: без пробелов, +84/84 (если вставлен полный номер) и ведущего 0; не больше 9. */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  // «+84…» или 11+ цифр с 84 в начале — вставлен номер с кодом страны (сами 9 цифр, начинающиеся на 84, — обычный ввод)
  if (d.startsWith('84') && (raw.trim().startsWith('+') || d.length >= PHONE_DIGITS + 2)) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, PHONE_DIGITS);
}

/**
 * Ввод, не набранный руками (автозаполнение браузера, вставка): +84901234567, 84901234567, 0901234567, «090 123 45 67».
 * foreign — номер другой страны (+380…, +7…, 00…): поле остаётся пустым, клиенту показываем подсказку.
 */
export function parsePhoneInput(raw: string): { digits: string; foreign: boolean } {
  const t = raw.trim();
  const intl = t.startsWith('+') || t.replace(/[^\d]/g, '').startsWith('00');
  const all = t.replace(/\D/g, '').replace(/^00/, '');
  if (intl && !all.startsWith('84')) return { digits: '', foreign: true };
  // без «+»: 11–15 цифр, не начинающиеся с 84 — тоже не вьетнамский номер (380501234567, 79161234567)
  if (!intl && all.length >= PHONE_DIGITS + 2 && !all.startsWith('84')) return { digits: '', foreign: true };
  return { digits: phoneDigits(intl ? `+${all}` : t), foreign: false };
}

/** 901234567 → «90 123 45 67» (без хвостового пробела — чтобы работал Backspace). */
export const formatDigits = (d: string) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');

export const isValidPhone = (digits: string) => digits.length === PHONE_DIGITS;

/** Для показа: «+84 90 123 45 67» из хранимого «+84901234567» (если формат другой — как есть). */
export function formatPhone(stored: string): string {
  const m = /^\+84(\d{9})$/.exec(stored.trim());
  return m ? `${PHONE_PREFIX} ${formatDigits(m[1])}` : stored.trim();
}

export const phoneHref = (stored: string) => `tel:${stored.replace(/[^\d+]/g, '')}`;
