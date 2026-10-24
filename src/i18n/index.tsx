'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ru, type TKey } from './ru';
import { ua } from './ua';
import { en } from './en';
import { vi } from './vi';

export type { TKey };
export type Lang = 'ua' | 'ru' | 'en' | 'vi';

export const LANGS: { id: Lang; flag: string; name: string; short: string }[] = [
  { id: 'ua', flag: '🇺🇦', name: 'Українська', short: 'UA' },
  { id: 'ru', flag: '🇷🇺', name: 'Русский', short: 'RU' },
  { id: 'en', flag: '🇬🇧', name: 'English', short: 'EN' },
  { id: 'vi', flag: '🇻🇳', name: 'Tiếng Việt', short: 'VI' },
];

const DICTS: Record<Lang, Record<TKey, string>> = { ua, ru, en, vi };
const PLURAL_LOCALE: Record<Lang, string> = { ua: 'uk', ru: 'ru', en: 'en', vi: 'vi' };
const STORAGE_KEY = 'ninifood.lang';
const DEFAULT_LANG: Lang = 'ru';

type Vars = Record<string, string | number>;

interface I18nValue {
  lang: Lang;
  ready: boolean;
  /** Сохранить выбор (localStorage) и закрыть модалку. */
  confirmLang: (l: Lang) => void;
  /** Модалка открыта: при первом визите автоматически, дальше — по кнопке в шапке. */
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  /** Язык уже выбирался раньше — модалку можно закрыть без выбора. */
  hasChosen: boolean;
  t: (key: TKey, vars?: Vars) => string;
  /** Перевод на произвольный язык (для превью в модалке выбора языка). */
  tIn: (l: Lang, key: TKey) => string;
  /** Слово в нужной форме: pl('unit.day', 3) → «дня». */
  pl: (base: 'unit.day' | 'unit.portion' | 'unit.lunch', n: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const interpolate = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hasChosen, setHasChosen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved && DICTS[saved]) {
        setLangState(saved);
        setHasChosen(true);
      } else setSheetOpen(true);
    } catch {
      setSheetOpen(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = PLURAL_LOCALE[lang];
  }, [lang]);

  const confirmLang = useCallback((l: Lang) => {
    setLangState(l);
    setSheetOpen(false);
    setHasChosen(true);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  const value = useMemo<I18nValue>(() => {
    const lookup = (key: string) => (DICTS[lang] as Record<string, string>)[key] || (ru as Record<string, string>)[key] || key;
    const rules = new Intl.PluralRules(PLURAL_LOCALE[lang]);
    return {
      lang,
      ready,
      confirmLang,
      sheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      hasChosen,
      t: (key, vars) => interpolate(lookup(key), vars),
      tIn: (l, key) => (DICTS[l] as Record<string, string>)[key] || lookup(key),
      pl: (base, n) => {
        const cat = rules.select(n);
        const key = `${base}_${cat}`;
        const v = lookup(key);
        return v === key ? lookup(`${base}_many`) : v;
      },
    };
  }, [lang, ready, sheetOpen, hasChosen, confirmLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
