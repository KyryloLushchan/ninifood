'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BOOKABLE_DAYS, SUB_MIN_DAYS, SUB_WINDOW_DAYS } from '@/config/site';
import { fetchMenu, type Menu } from '@/data/menu';
import { useI18n, type Lang } from '@/i18n';
import { addDays, isSunday, todayISO } from '@/lib/dates';
import { onceTotals, subTotals, type OrderType, type Totals } from '@/lib/pricing';
import { DEFAULT_SETTINGS, fetchSiteSettings, type SiteSettings } from '@/lib/site-settings';
import { compressToJpeg } from '@/lib/compress-image';
import type { PlaceInfo } from '@/lib/places';
import { OrderError, submitOrder } from '@/lib/submit-order';
import type { GateSession } from '@/lib/auth-gate';
import { customerDb, fetchProfile, signOutCustomer, type CustomerProfile } from '@/lib/customer-auth';
import { phoneDigits } from '@/lib/phone';
import { DRAFT_ID_RE, fetchDraft } from '@/lib/order-draft';

export type Screen = 'home' | 'order' | 'checkout' | 'payment' | 'thanks' | 'orders' | 'auth';
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
    telegram: c.telegram || cust.telegram || '',
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

  /** Вошёл по email (необязательно); null — гость. */
  customer: CustomerProfile | null;
  /** Персональная скидка клиента на обеды, % (0 — нет; только для показа — сервер считает сам по email из JWT). */
  discount: number;
  /** VIP (только для показа календаря; право на сегодняшний день проверяет send-order по JWT). */
  isVip: boolean;
  /** Открыть экран входа/регистрации; после успеха или «назад» вернёмся на текущий экран. */
  openAuth: () => void;
  closeAuth: () => void;
  /** Сессия, выданная auth-gate: кладём в клиент и грузим профиль. */
  acceptSession: (s: GateSession) => Promise<void>;
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
  /** Ссылка «Продолжить на телефоне» (?d=) устарела или не найдена — показать уведомление. */
  draftStale: boolean;
  dismissDraftStale: () => void;
  reset: () => void;
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { lang, confirmLang } = useI18n();
  const langRef = useRef({ lang, confirmLang });
  langRef.current = { lang, confirmLang };
  const draftIdRef = useRef<string | null>(null);
  const [draftStale, setDraftStale] = useState(false);
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
  const [discount, setDiscount] = useState(0);
  const [authFrom, setAuthFrom] = useState<Screen>('home');

  const loadProfile = useCallback(async () => {
    try {
      const r = await fetchProfile();
      setCustomer(r?.profile ?? null);
      setIsVip(r?.vip ?? false);
      setDiscount(r?.discount ?? 0);
    } catch {
      setCustomer(null);
      setIsVip(false);
      setDiscount(0);
    }
  }, []);

  // Сессия клиента (если входил раньше) и её изменения (вход/выход/истечение).
  useEffect(() => {
    void loadProfile();
    const { data } = customerDb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setCustomer(null);
        setIsVip(false);
        setDiscount(0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  // Автозаполнение: Telegram, телефон и адрес из профиля — только в пустые поля.
  useEffect(() => {
    if (!customer) return;
    const typed = contactRef.current.address.trim();
    setContact((c) => prefillContact(c, customer));
    // Координаты профиля подходят, только если адрес не вводили руками (или это тот же адрес).
    if (!typed || typed === customer.address) setPlace((pl) => pl ?? prefillPlace(customer));
  }, [customer]);

  const logout = useCallback(async () => {
    await signOutCustomer();
    setCustomer(null);
    setIsVip(false);
    setDiscount(0);
    setContact(EMPTY_CONTACT);
    setPlace(null);
    setScreen((s) => (s === 'orders' ? 'home' : s));
  }, []);

  // Ссылка «Продолжить на телефоне»: ?d=ID → черновик → заполняем заказ и открываем экран оплаты.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('d');
    if (id === null) return;
    const clean = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('d');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    };
    const stale = () => {
      setDraftStale(true);
      clean();
    };
    if (!DRAFT_ID_RE.test(id)) return stale();
    void fetchDraft(id).then((d) => {
      const tomorrow = addDays(todayISO(), 1);
      const days = d ? d.days.filter((x) => x >= tomorrow && !isSunday(x)) : [];
      if (!d || days.length < (d.type === 'subscription' ? SUB_MIN_DAYS : 1)) return stale();
      draftIdRef.current = id;
      if (d.type === 'subscription') {
        setOrderType('sub');
        setSubDays(days);
      } else {
        setOrderType('once');
        setOnceDays(days);
      }
      setPortionsState(d.portions);
      setContact({ telegram: d.telegram, phone: phoneDigits(d.phone), address: d.address, hotel: d.hotel, comment: d.comment });
      setPlace(d.place_id && d.lat != null && d.lng != null ? { placeId: d.place_id, text: d.address, lat: d.lat, lng: d.lng } : null);
      setPayment(d.payment);
      // Язык клиента с компьютера — только если на телефоне язык ещё не выбирали.
      if (d.lang && ['ua', 'ru', 'en', 'vi'].includes(d.lang) && !localStorage.getItem('ninifood.lang')) langRef.current.confirmLang(d.lang as Lang);
      setScreen(d.payment === 'cash' ? 'checkout' : 'payment');
      clean();
    });
  }, []);

  // Сегодняшняя дата по Дананг-времени; пересчитывается, если вкладку оставили открытой на ночь.
  useEffect(() => {
    const sync = () => setToday((prev) => {
      const next = todayISO();
      return prev === next ? prev : next;
    });
    sync();
    // Вкладка могла остаться открытой через полночь: без таймера «завтра» устаревало и вчерашний «завтрашний» день (= сегодня) выглядел доступным.
    const timer = setInterval(sync, 30_000);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
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
      ? onceTotals(onceDays.length, portions, siteSettings.priceSingle, siteSettings.deliverySingle, discount)
      : subTotals(subDays.length, portions, siteSettings.priceSub, SUB_MIN_DAYS, siteSettings.deliverySingle, discount);
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

  const openAuth = useCallback(() => {
    setScreen((cur) => {
      if (cur !== 'auth') setAuthFrom(cur);
      return 'auth';
    });
    window.scrollTo(0, 0);
  }, []);
  const closeAuth = useCallback(() => go(authFrom), [go, authFrom]);
  const acceptSession = useCallback(
    async (sess: GateSession) => {
      const { error } = await customerDb.auth.setSession(sess);
      if (error) throw error;
      await loadProfile();
      go(authFrom);
    },
    [loadProfile, go, authFrom],
  );

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
    draftIdRef.current = null;
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
        draftId: draftIdRef.current,
      });
      draftIdRef.current = null;
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
    discount,
    openAuth,
    closeAuth,
    acceptSession,
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
    draftStale,
    dismissDraftStale: () => setDraftStale(false),
    reset,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

