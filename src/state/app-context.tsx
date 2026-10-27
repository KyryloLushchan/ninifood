'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BOOKABLE_DAYS, SUB_MIN_DAYS, SUB_WINDOW_DAYS } from '@/config/site';
import { fetchMenu, type Menu } from '@/data/menu';
import { useI18n } from '@/i18n';
import { addDays, isSunday, todayISO } from '@/lib/dates';
import { onceTotals, subTotals, type OrderType, type Totals } from '@/lib/pricing';
import { DEFAULT_SETTINGS, fetchSiteSettings, type SiteSettings } from '@/lib/site-settings';
import { compressToJpeg } from '@/lib/compress-image';
import type { PlaceInfo } from '@/lib/places';
import { OrderError, submitOrder } from '@/lib/submit-order';

export type Screen = 'home' | 'order' | 'checkout' | 'payment' | 'thanks';
export type Payment = 'qr' | 'cash';

export interface Contact {
  telegram: string;
  /** Только национальные цифры без +84 (до 9). */
  phone: string;
  address: string;
  hotel: string;
  comment: string;
}
const EMPTY_CONTACT: Contact = { telegram: '', phone: '', address: '', hotel: '', comment: '' };

export interface PlacedOrder {
  orderId: string;
  type: OrderType;
  days: string[];
  portions: number;
  total: number;
  payment: Payment;
}

interface AppValue {
  screen: Screen;
  go: (s: Screen) => void;

  today: string | null;
  menu: Menu;
  menuLoaded: boolean;
  /** Цены и ссылка Telegram из settings (до загрузки — значения из config/site.ts). */
  settings: SiteSettings;
  /** Доступные для заказа дни: есть меню, не сегодня, не воскресенье. */
  availableDays: string[];
  /** Ближайшие BOOKABLE_DAYS дней: их видно в меню и можно выбрать в разовом заказе. */
  bookableDays: string[];
  nearestDay: string | null;
  /** Дни Пн–Сб ближайших 2 недель (кроме сегодня) — кандидаты для подписки, независимо от наличия меню. */
  subscriptionDays: string[];

  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  onceDays: string[];
  toggleOnceDay: (iso: string) => void;
  subDays: string[];
  toggleSubDay: (iso: string) => void;
  portions: number;
  setPortions: (n: number) => void;

  days: string[];
  total: number;
  /** Разбивка итога: обеды / доставка / всего. */
  sum: Totals;

  startOnce: (iso: string) => void;
  startSub: () => void;

  contact: Contact;
  setContactField: (k: keyof Contact, v: string) => void;
  /** Выбранное в подсказках место (place_id + координаты); null — адрес введён вручную. */
  place: PlaceInfo | null;
  /** Подставляет выбранное место в поле адреса и запоминает координаты. */
  selectPlace: (p: PlaceInfo) => void;
  payment: Payment;
  setPayment: (p: Payment) => void;
  screenshot: File | null;
  setScreenshot: (f: File | null) => void;
  sending: boolean;
  /** Ключ i18n последней ошибки отправки (error.*) или null. */
  submitError: string | null;
  clearSubmitError: () => void;
  placeOrder: () => Promise<void>;
  placed: PlacedOrder | null;
  reset: () => void;
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [screen, setScreen] = useState<Screen>('home');
  const [today, setToday] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>({});
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetchSiteSettings().then(setSiteSettings);
  }, []);

  const [orderType, setOrderType] = useState<OrderType>('once');
  const [onceDaysRaw, setOnceDays] = useState<string[]>([]);
  const [subDaysRaw, setSubDays] = useState<string[] | null>(null);
  const [portions, setPortionsState] = useState(1);

  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [payment, setPayment] = useState<Payment>('qr');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  // Сегодняшняя дата по Дананг-времени; пересчитывается, если вкладку оставили открытой на ночь.
  useEffect(() => {
    const sync = () => setToday((prev) => {
      const next = todayISO();
      return prev === next ? prev : next;
    });
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (!today) return;
    let cancelled = false;
    fetchMenu(today).then((m) => {
      if (cancelled) return;
      setMenu(m);
      setMenuLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  // Доступные дни — по календарю (не сегодня, не воскресенье), независимо от наличия меню.
  const availableDays = useMemo(
    () =>
      today
        ? Array.from({ length: SUB_WINDOW_DAYS }, (_, i) => addDays(today, i + 1)).filter((d) => !isSunday(d))
        : [],
    [today],
  );
  const bookableDays = useMemo(() => availableDays.slice(0, BOOKABLE_DAYS), [availableDays]);
  const nearestDay = availableDays[0] ?? null;

  const availableSet = useMemo(() => new Set(availableDays), [availableDays]);
  const bookableSet = useMemo(() => new Set(bookableDays), [bookableDays]);
  const subscriptionDays = useMemo(
    () =>
      today
        ? Array.from({ length: SUB_WINDOW_DAYS }, (_, i) => addDays(today, i + 1)).filter((d) => !isSunday(d))
        : [],
    [today],
  );
  const subscriptionSet = useMemo(() => new Set(subscriptionDays), [subscriptionDays]);

  const onceDays = useMemo(() => onceDaysRaw.filter((d) => bookableSet.has(d)).sort(), [onceDaysRaw, bookableSet]);
  const subDays = useMemo(
    () => (subDaysRaw ? subDaysRaw.filter((d) => subscriptionSet.has(d)) : subscriptionDays.slice(0, SUB_MIN_DAYS)).sort(),
    [subDaysRaw, subscriptionSet, subscriptionDays],
  );

  const days = orderType === 'once' ? onceDays : subDays;
  const sum: Totals =
    orderType === 'once'
      ? onceTotals(onceDays.length, portions, siteSettings.priceSingle, siteSettings.deliverySingle)
      : subTotals(subDays.length, portions, siteSettings.priceSub, SUB_MIN_DAYS, siteSettings.deliverySingle);
  const { total } = sum;

  const toggleOnceDay = useCallback(
    (iso: string) => setOnceDays((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso])),
    [],
  );

  const toggleSubDay = useCallback(
    (iso: string) => {
      setSubDays(subDays.includes(iso) ? subDays.filter((d) => d !== iso) : [...subDays, iso]);
    },
    [subDays],
  );

  const go = useCallback((s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  }, []);

  const startOnce = useCallback(
    (iso: string) => {
      setOrderType('once');
      setOnceDays([iso]);
      go('order');
    },
    [go],
  );

  const startSub = useCallback(() => {
    setOrderType('sub');
    go('order');
  }, [go]);

  const reset = useCallback(() => {
    setOrderType('once');
    setOnceDays([]);
    setSubDays(null);
    setPortionsState(1);
    setContact(EMPTY_CONTACT);
    setPlace(null);
    setPayment('qr');
    setScreenshot(null);
    setSubmitError(null);
    setPlaced(null);
    go('home');
  }, [go]);

  const placeOrder = useCallback(async () => {
    setSending(true);
    setSubmitError(null);
    try {
      const shot = payment === 'qr' && screenshot ? await compressToJpeg(screenshot) : null;
      const { orderNumber } = await submitOrder({
        type: orderType,
        days,
        portions,
        payment,
        contact,
        place,
        screenshot: shot,
        lang,
      });
      setPlaced({ orderId: orderNumber, type: orderType, days, portions, total, payment });
      go('thanks');
    } catch (e) {
      const code = e instanceof OrderError ? e.code : 'generic';
      setSubmitError(`error.${['bad_days', 'bad_portions', 'telegram_required', 'phone_invalid', 'address_required', 'screenshot_required', 'screenshot_type', 'screenshot_size', 'network'].includes(code) ? code : 'generic'}`);
    } finally {
      setSending(false);
    }
  }, [orderType, days, portions, total, payment, contact, place, screenshot, lang, go]);

  const value: AppValue = {
    screen,
    go,
    today,
    menu,
    menuLoaded,
    settings: siteSettings,
    availableDays,
    bookableDays,
    nearestDay,
    subscriptionDays,
    orderType,
    setOrderType,
    onceDays,
    toggleOnceDay,
    subDays,
    toggleSubDay,
    portions,
    setPortions: (n) => setPortionsState(Math.max(1, n)),
    days,
    total,
    sum,
    startOnce,
    startSub,
    contact,
    setContactField: (k, v) => {
      setContact((c) => ({ ...c, [k]: v }));
      // Адрес изменён руками после выбора — координаты больше не относятся к тексту.
      if (k === 'address') setPlace((pl) => (pl && pl.text !== v ? null : pl));
    },
    place,
    selectPlace: (pl) => {
      setContact((c) => ({ ...c, address: pl.text }));
      setPlace(pl);
    },
    payment,
    setPayment,
    screenshot,
    setScreenshot,
    sending,
    submitError,
    clearSubmitError: () => setSubmitError(null),
    placeOrder,
    placed,
    reset,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

