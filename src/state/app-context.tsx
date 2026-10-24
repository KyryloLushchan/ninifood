'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BOOKABLE_DAYS, SUB_DAYS, SUB_WINDOW_DAYS } from '@/config/site';
import { fetchMenu, type Menu } from '@/data/mock-menu';
import { useI18n } from '@/i18n';
import { addDays, isSunday, isWeekday, todayISO } from '@/lib/dates';
import { onceTotal, subTotal, type OrderType } from '@/lib/pricing';
import { generateOrderId, submitOrder } from '@/lib/submit-order';

export type Screen = 'home' | 'order' | 'checkout' | 'payment' | 'thanks';
export type Payment = 'qr' | 'cash';

export interface Contact {
  telegram: string;
  address: string;
  hotel: string;
  comment: string;
}
const EMPTY_CONTACT: Contact = { telegram: '', address: '', hotel: '', comment: '' };

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
  /** Доступные для заказа дни: есть меню, не сегодня, не воскресенье. */
  availableDays: string[];
  /** Ближайшие BOOKABLE_DAYS дней: их видно в меню и можно выбрать в разовом заказе. */
  bookableDays: string[];
  nearestDay: string | null;
  /** Будние дни ближайших 2 недель (кроме сегодня) — кандидаты для подписки, независимо от наличия меню. */
  subscriptionDays: string[];

  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  onceDays: string[];
  toggleOnceDay: (iso: string) => void;
  subDays: string[];
  /** false, если 5 дней уже выбрано и новый добавить нельзя. */
  toggleSubDay: (iso: string) => boolean;
  portions: number;
  setPortions: (n: number) => void;

  days: string[];
  total: number;

  startOnce: (iso: string) => void;
  startSub: () => void;

  contact: Contact;
  setContactField: (k: keyof Contact, v: string) => void;
  payment: Payment;
  setPayment: (p: Payment) => void;
  screenshot: File | null;
  setScreenshot: (f: File | null) => void;
  orderId: string | null;
  ensureOrderId: () => string;
  sending: boolean;
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

  const [orderType, setOrderType] = useState<OrderType>('once');
  const [onceDaysRaw, setOnceDays] = useState<string[]>([]);
  const [subDaysRaw, setSubDays] = useState<string[] | null>(null);
  const [portions, setPortionsState] = useState(1);

  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [payment, setPayment] = useState<Payment>('qr');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
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
        ? Array.from({ length: SUB_WINDOW_DAYS }, (_, i) => addDays(today, i + 1)).filter(isWeekday)
        : [],
    [today],
  );
  const subscriptionSet = useMemo(() => new Set(subscriptionDays), [subscriptionDays]);

  const onceDays = useMemo(() => onceDaysRaw.filter((d) => bookableSet.has(d)).sort(), [onceDaysRaw, bookableSet]);
  const subDays = useMemo(
    () => (subDaysRaw ? subDaysRaw.filter((d) => subscriptionSet.has(d)) : subscriptionDays.slice(0, SUB_DAYS)).sort(),
    [subDaysRaw, subscriptionSet, subscriptionDays],
  );

  const days = orderType === 'once' ? onceDays : subDays;
  const total = orderType === 'once' ? onceTotal(onceDays.length, portions) : subTotal(portions);

  const toggleOnceDay = useCallback(
    (iso: string) => setOnceDays((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso])),
    [],
  );

  const toggleSubDay = useCallback(
    (iso: string) => {
      if (subDays.includes(iso)) {
        setSubDays(subDays.filter((d) => d !== iso));
        return true;
      }
      if (subDays.length >= SUB_DAYS) return false;
      setSubDays([...subDays, iso]);
      return true;
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

  const ensureOrderId = useCallback(() => {
    if (orderId) return orderId;
    const id = generateOrderId();
    setOrderId(id);
    return id;
  }, [orderId]);

  const reset = useCallback(() => {
    setOrderType('once');
    setOnceDays([]);
    setSubDays(null);
    setPortionsState(1);
    setContact(EMPTY_CONTACT);
    setPayment('qr');
    setScreenshot(null);
    setOrderId(null);
    setPlaced(null);
    go('home');
  }, [go]);

  const placeOrder = useCallback(async () => {
    const id = ensureOrderId();
    setSending(true);
    try {
      await submitOrder({
        orderId: id,
        type: orderType,
        days,
        portions,
        total,
        payment,
        contact,
        screenshot: payment === 'qr' ? screenshot : null,
        lang,
      });
      setPlaced({ orderId: id, type: orderType, days, portions, total, payment });
      go('thanks');
    } finally {
      setSending(false);
    }
  }, [ensureOrderId, orderType, days, portions, total, payment, contact, screenshot, lang, go]);

  const value: AppValue = {
    screen,
    go,
    today,
    menu,
    menuLoaded,
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
    startOnce,
    startSub,
    contact,
    setContactField: (k, v) => setContact((c) => ({ ...c, [k]: v })),
    payment,
    setPayment,
    screenshot,
    setScreenshot,
    orderId,
    ensureOrderId,
    sending,
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

