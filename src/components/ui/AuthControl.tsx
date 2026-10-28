'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useApp } from '@/state/app-context';

/** Кнопка входа (гость) или меню клиента: «Мої замовлення» / «Вийти». variant=header — короткая подпись, full — на оформлении. */
export function AuthControl({ variant = 'header' }: { variant?: 'header' | 'full' }) {
  const { t } = useI18n();
  const { customer, openAuth, logout, go } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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
      <button
        onClick={openAuth}
        className={`rounded-full border-2 border-accent font-bold text-accent hover:bg-accent-soft/60 ${
          variant === 'full' ? 'h-11 w-full px-4 text-[15px]' : 'h-9 px-3.5 text-sm'
        }`}
      >
        {t(variant === 'full' ? 'auth.loginFull' : 'auth.login')}
      </button>
    );
  }

  const name = customer.email ? customer.email.split('@')[0] : t('auth.account');
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 max-w-[150px] items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-bold hover:bg-sand"
      >
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
