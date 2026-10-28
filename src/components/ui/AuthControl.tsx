'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { preloadTelegramWidget } from '@/lib/customer-auth';
import { useApp } from '@/state/app-context';

const Plane = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.9 3.4 2.6 10.8c-.9.4-.9 1.1-.2 1.3l4.9 1.5 1.9 5.8c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8L23.2 4.7c.3-1.3-.5-1.9-1.3-1.3ZM8.6 13.1l9.9-6.2c.5-.3.9-.1.5.2l-8.1 7.3-.3 3.4-2-4.7Z" />
  </svg>
);

/** Кнопка входа через Telegram (гость) или меню клиента: «Мої замовлення» / «Вийти». variant=header — короткая подпись. */
export function AuthControl({ variant = 'header' }: { variant?: 'header' | 'full' }) {
  const { t } = useI18n();
  const { customer, authBusy, authError, loginTelegram, logout, go } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customer) preloadTelegramWidget();
  }, [customer]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!customer) {
    return (
      <div className={`flex flex-col gap-1 ${variant === 'full' ? 'items-stretch' : 'items-end'}`}>
        <button
          onClick={() => void loginTelegram()}
          disabled={authBusy}
          className={`flex items-center justify-center gap-2 rounded-full bg-[#2AABEE] font-bold text-white disabled:opacity-60 ${
            variant === 'full' ? 'h-11 px-4 text-[15px]' : 'h-9 px-3 text-sm'
          }`}
        >
          <Plane />
          {authBusy ? t('auth.signingIn') : t(variant === 'full' ? 'auth.login' : 'auth.loginShort')}
        </button>
        {authError && <span className="text-xs font-bold text-accent">{t('auth.error')}</span>}
      </div>
    );
  }

  const name = customer.telegramUsername ? `@${customer.telegramUsername}` : t('auth.account');
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 max-w-[150px] items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-bold hover:bg-sand"
      >
        <span className="text-[#2AABEE]"><Plane /></span>
        <span className="truncate">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 flex min-w-[180px] flex-col overflow-hidden rounded-md2 border border-line bg-card shadow-seg">
          <button
            className="px-4 py-3 text-left text-[15px] font-bold hover:bg-sand"
            onClick={() => {
              setOpen(false);
              go('orders');
            }}
          >
            {t('auth.myOrders')}
          </button>
          <button
            className="border-t border-line px-4 py-3 text-left text-[15px] font-bold text-ink-2 hover:bg-sand"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
