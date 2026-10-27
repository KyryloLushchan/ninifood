'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { CashTab } from './CashTab';
import { CourierTab } from './CourierTab';
import { MenuTab } from './MenuTab';
import { MoneyTab } from './MoneyTab';
import { OrdersTab } from './OrdersTab';
import { SettingsTab } from './SettingsTab';
import { MfaChallenge, MfaRequired } from './Mfa';
import { Btn, Err, inputCls } from './ui';

const TABS = [
  ['courier', 'Курьер', '🚚'],
  ['orders', 'Заказы', '📋'],
  ['menu', 'Меню', '🍲'],
  ['cash', 'Касса', '🧾'],
  ['money', 'Деньги', '💰'],
  ['settings', 'Настройки', '⚙️'],
] as const;
type Tab = (typeof TABS)[number][0];

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await adminDb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('Неверная почта или пароль');
  };

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-3 px-5">
      <div className="mb-2 text-center font-serif text-[26px] font-bold text-accent">NiniFood · админка</div>
      <input className={inputCls} type="email" autoComplete="username" placeholder="Электронная почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className={inputCls} type="password" autoComplete="current-password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Err>{error}</Err>
      <Btn type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</Btn>
    </form>
  );
}

/** Автовыход: сессия админа живёт не дольше 12 часов от входа по паролю. */
const SESSION_MAX_MS = 12 * 3600 * 1000;

type Mfa = { state: 'checking' } | { state: 'ok' } | { state: 'enroll' } | { state: 'challenge'; factors: { id: string; name: string }[] };

export function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [mfa, setMfa] = useState<Mfa>({ state: 'checking' });
  const [mfaTick, setMfaTick] = useState(0);
  const [tab, setTab] = useState<Tab>('courier');

  useEffect(() => {
    adminDb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = adminDb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Вторая ступень (TOTP): без aal2 админских прав нет — is_admin() в БД проверяет claim aal2.
  useEffect(() => {
    setMfa({ state: 'checking' });
    if (!session) return;
    let dead = false;
    (async () => {
      const { data: aal } = await adminDb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (dead) return;
      if (aal?.currentLevel === 'aal2') return setMfa({ state: 'ok' });
      const { data: list } = await adminDb.auth.mfa.listFactors();
      if (dead) return;
      const factors = (list?.totp ?? []).map((f) => ({ id: f.id, name: f.friendly_name || 'Устройство' }));
      setMfa(factors.length ? { state: 'challenge', factors } : { state: 'enroll' });
    })();
    return () => {
      dead = true;
    };
  }, [session?.user.id, mfaTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsAdmin(null);
    if (!session || mfa.state !== 'ok') return;
    adminDb.rpc('is_admin').then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [session?.user.id, mfa.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Автовыход через 12 часов после входа по паролю (проверка при загрузке и раз в минуту).
  useEffect(() => {
    const at = session?.user.last_sign_in_at ? Date.parse(session.user.last_sign_in_at) : NaN;
    if (!session || Number.isNaN(at)) return;
    const check = () => {
      if (Date.now() - at > SESSION_MAX_MS) void adminDb.auth.signOut();
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [session?.user.last_sign_in_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <div className="p-10 text-center text-ink-muted">Загрузка…</div>;
  if (!session) return <Login />;

  const signOut = () => adminDb.auth.signOut();

  if (mfa.state === 'checking') return <div className="p-10 text-center text-ink-muted">Проверяем защиту…</div>;
  if (mfa.state === 'enroll') return <MfaRequired onDone={() => setMfaTick((n) => n + 1)} onSignOut={signOut} />;
  if (mfa.state === 'challenge') return <MfaChallenge factorIds={mfa.factors} onDone={() => setMfaTick((n) => n + 1)} onSignOut={signOut} />;

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
        {tab === 'menu' && <MenuTab />}
        {tab === 'cash' && <CashTab />}
        {tab === 'money' && <MoneyTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-card">
        <div className="mx-auto grid max-w-[640px] grid-cols-6 pb-[env(safe-area-inset-bottom)]">
          {TABS.map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-extrabold ${tab === id ? 'text-accent' : 'text-ink-muted'}`}>
              <span className="text-[20px] leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
