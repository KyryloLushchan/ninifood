'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BOOKABLE_DAYS, SUB_MIN_DAYS, SUB_WINDOW_DAYS } from '@/config/site';
import { fetchMenu, type Menu } from '@/data/menu';
import { useI18n } from '@/i18n';
import { addDays, isSunday, todayISO } from '@/lib/dates';
import { onceTotals, subTotals, type OrderType, type Totals } from '@/lib/pricing';
import { DEFAULT_SETTINGS, fetchSiteSettings, type SiteSettings } from '@/lib/site-settings';
import { compressToJpeg } from '@/lib/compress-image';
import type { PlaceInfo } from '@/lib/places';
import { OrderError, submitOrder } from '@/lib/submit-order';
import { customerDb, fetchProfile, signInWithTelegram, signOutCustomer, telegramPopup, type CustomerProfile } from '@/lib/customer-auth';
import { phoneDigits } from '@/lib/phone';

export type Screen = 'home' | 'order' | 'checkout' | 'payment' | 'thanks' | 'orders';
export type Payment = 'qr' | 'cash' | 'other';

export interface Contact {
  telegram: string;
  /** Только национальные цифры без +84 (до 9). */
  phone: string;
  address: string;
  hotel: string;
  comment: string;
}
const EMPTY_CONTACT: Contact = { telegram: '', phone: '', address: '', hotel: '', comment: '' };

function prefillContact(c: Contact, cust: CustomerProfile): Contact {
  return {
    ...c,
    telegram: cust.telegramUsername ? `@${cust.telegramUsername}` : c.telegram,
    phone: c.phone || (cust.phone ? phoneDigits(cust.phone) : ''),
    address: c.address || cust.address || '',
  };
}
const prefillPlace = (cust: CustomerProfile): PlaceInfo | null =>
  cust.placeId && cust.lat != null && cust.lng != null && cust.address ? { placeId: cust.placeId, text: cust.address, lat: cust.lat, lng: cust.lng } : null;

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

  /** Вошёл через Telegram (необязательно); null — гость. */
  customer: CustomerProfile | null;
  /** VIP (только для показа календаря; право на сегодняшний день проверяет send-order по JWT). */
  isVip: boolean;
  authBusy: boolean;
  /** Ключ i18n ошибки входа или null. */
  authError: string | null;
  /** Вызывать из обработчика клика (открывает окно Telegram). */
  loginTelegram: () => Promise<void>;
  logout: () => Promise<void>;

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
  /** Токен Cloudflare Turnstile для текущей отправки (null — проверка не пройдена). */
  captcha: string | null;
  setCaptcha: (t: string | null) => void;
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
  const contactRef = useRef(contact);
  contactRef.current = contact;
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment>('qr');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isVip, setIsVip] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const r = await fetchProfile();
      setCustomer(r?.profile ?? null);
      setIsVip(r?.vip ?? false);
    } catch {
      setCustomer(null);
      setIsVip(false);
    }
  }, []);

  // Сессия клиента (если входил раньше) и её изменения (вход/выход/истечение).
  useEffect(() => {
    void loadProfile();
    const { data } = customerDb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setCustomer(null);
        setIsVip(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  // Автозаполнение: ник Telegram (поле блокируется на экране), телефон и адрес из профиля — только в пустые поля.
  useEffect(() => {
    if (!customer) return;
    const typed = contactRef.current.address.trim();
    setContact((c) => prefillContact(c, customer));
    // Координаты профиля подходят, только если адрес не вводили руками (или это тот же адрес).
    if (!typed || typed === customer.address) setPlace((pl) => pl ?? prefillPlace(customer));
  }, [customer]);

  const loginTelegram = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const data = await telegramPopup(lang);
      if (!data) return; // окно закрыли без входа
      await signInWithTelegram(data);
      await loadProfile();
    } catch {
      setAuthError('auth.error');
    } finally {
      setAuthBusy(false);
    }
  }, [lang, loadProfile]);

  const logout = useCallback(async () => {
    await signOutCustomer();
    setCustomer(null);
    setIsVip(false);
    setContact(EMPTY_CONTACT);
    setPlace(null);
    setScreen((s) => (s === 'orders' ? 'home' : s));
  }, []);

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
        ? Array.from({ length: SUB_WINDOW_DAYS }, (_, i) => addDays(today, i + (isVip ? 0 : 1))).filter((d) => !isSunday(d))
        : [],
    [today, isVip],
  );
  const bookableDays = useMemo(() => availableDays.slice(0, BOOKABLE_DAYS), [availableDays]);
  const nearestDay = availableDays[0] ?? null;

  const availableSet = useMemo(() => new Set(availableDays), [availableDays]);
  const bookableSet = useMemo(() => new Set(bookableDays), [bookableDays]);
  const subscriptionDays = useMemo(
    () =>
      today
        ? Array.from({ length: SUB_WINDOW_DAYS }, (_, i) => addDays(today, i + (isVip ? 0 : 1))).filter((d) => !isSunday(d))
        : [],
    [today, isVip],
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
    setContact(customer ? prefillContact(EMPTY_CONTACT, customer) : EMPTY_CONTACT);
    setPlace(customer ? prefillPlace(customer) : null);
    setPayment('qr');
    setScreenshot(null);
    setSubmitError(null);
    setPlaced(null);
    go('home');
  }, [go, customer]);

  const placeOrder = useCallback(async () => {
    setSending(true);
    setSubmitError(null);
    try {
      const shot = payment !== 'cash' && screenshot ? await compressToJpeg(screenshot) : null;
      const accessToken = customer ? (await customerDb.auth.getSession()).data.session?.access_token ?? null : null;
      const { orderNumber } = await submitOrder({
        type: orderType,
        days,
        portions,
        payment,
        contact,
        place,
        captcha,
        screenshot: shot,
        lang,
        accessToken,
      });
      setPlaced({ orderId: orderNumber, type: orderType, days, portions, total, payment });
      go('thanks');
      if (customer) void loadProfile(); // сервер сохранил телефон и адрес
    } catch (e) {
      const code = e instanceof OrderError ? e.code : 'generic';
      setSubmitError(`error.${['bad_days', 'bad_portions', 'telegram_required', 'phone_invalid', 'captcha_failed', 'rate_limited', 'address_required', 'screenshot_required', 'screenshot_type', 'screenshot_size', 'network'].includes(code) ? code : 'generic'}`);
    } finally {
      setSending(false);
    }
  }, [orderType, days, portions, total, payment, contact, place, captcha, screenshot, lang, go, customer, loadProfile]);

  const value: AppValue = {
    screen,
    go,
    customer,
    isVip,
    authBusy,
    authError,
    loginTelegram,
    logout,
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
    captcha,
    setCaptcha,
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

