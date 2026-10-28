'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { callGate } from '@/lib/auth-gate';
import { TurnstileBox } from '@/components/ui/TurnstileWidget';
import { CashTab } from './CashTab';
import { CourierTab } from './CourierTab';
import { MenuTab } from './MenuTab';
import { MoneyTab } from './MoneyTab';
import { OrdersTab } from './OrdersTab';
import { SettingsTab } from './SettingsTab';
import { SubscriptionsTab } from './SubscriptionsTab';
import { Btn, Err, inputCls } from './ui';

const TABS = [
  ['courier', 'Курьер', '🚚'],
  ['orders', 'Заказы', '📋'],
  ['subs', 'Подписки', '🔁'],
  ['menu', 'Меню', '🍲'],
  ['cash', 'Касса', '🧾'],
  ['money', 'Деньги', '💰'],
  ['settings', 'Настройки', '⚙️'],
] as const;
type Tab = (typeof TABS)[number][0];

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: 'Неверная почта или пароль',
  locked: 'Слишком много неудачных попыток. Подождите 15 минут.',
  captcha_failed: 'Не пройдена проверка «я не робот». Попробуйте ещё раз.',
  network: 'Нет связи с сервером. Проверьте интернет.',
};

/** Вход: почта + пароль через auth-gate (Turnstile, пауза 15 минут после 5 неудач, уведомление в Telegram при входе). */
function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captcha) return setError(LOGIN_ERRORS.captcha_failed);
    setBusy(true);
    setError('');
    const r = await callGate({ action: 'signin', email: email.trim(), password, captcha });
    setResetKey((k) => k + 1);
    if (!r.ok || !r.session) {
      setBusy(false);
      return setError(r.ok ? 'Не удалось войти' : (LOGIN_ERRORS[r.code] ?? 'Не удалось войти. Попробуйте ещё раз.'));
    }
    const { error } = await adminDb.auth.setSession(r.session);
    setBusy(false);
    if (error) setError('Не удалось войти. Попробуйте ещё раз.');
  };

  return (
    <form onSubmit={submit} method="post" className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-3 px-5">
      <div className="mb-2 text-center font-serif text-[26px] font-bold text-accent">NiniFood · админка</div>
      <input className={inputCls} id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" placeholder="Электронная почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className={inputCls} id="password" name="password" type="password" autoComplete="current-password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <TurnstileBox language="ru-ru" onToken={setCaptcha} resetKey={resetKey} failedText="Не удалось загрузить проверку. Обновите страницу." />
      <Err>{error}</Err>
      <Btn type="submit" disabled={busy || !captcha}>{busy ? 'Входим…' : 'Войти'}</Btn>
    </form>
  );
}

export function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('courier');

  useEffect(() => {
    adminDb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = adminDb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setIsAdmin(null);
    if (!session) return;
    adminDb.rpc('is_admin').then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <div className="p-10 text-center text-ink-muted">Загрузка…</div>;
  if (!session) return <Login />;

  const signOut = () => adminDb.auth.signOut();

  if (isAdmin === null) return <div className="p-10 text-center text-ink-muted">Проверяем доступ…</div>;
  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-5 text-center">
        <div className="font-serif text-[26px] font-semibold">Нет доступа</div>
        <div className="text-sm text-ink-2">Аккаунт {session.user.email} не входит в список администраторов.</div>
        <Btn kind="ghost" onClick={signOut}>Выйти</Btn>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="font-serif text-screen font-bold text-accent">NiniFood · админка</div>
        <button onClick={signOut} className="text-sm font-bold text-ink-muted hover:underline">Выйти</button>
      </header>
      <main className="flex-1 px-4 pb-28 pt-1">
        {tab === 'courier' && <CourierTab />}
        {tab === 'orders' && <OrdersTab adminEmail={session.user.email ?? session.user.id} />}
        {tab === 'subs' && <SubscriptionsTab adminEmail={session.user.email ?? session.user.id} />}
        {tab === 'menu' && <MenuTab />}
        {tab === 'cash' && <CashTab />}
        {tab === 'money' && <MoneyTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-card">
        <div className="mx-auto grid max-w-[640px] grid-cols-7 pb-[env(safe-area-inset-bottom)]">
          {TABS.map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id} className={`flex flex-col items-center gap-0.5 py-2 text-[9px] font-extrabold min-[420px]:text-[10px] ${tab === id ? 'text-accent' : 'text-ink-muted'}`}>
              <span className="text-[18px] leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
