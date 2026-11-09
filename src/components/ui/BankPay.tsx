'use client';

import { useEffect, useState } from 'react';
import { BANK_APPS, bankLogo } from '@/config/bank-apps';
import { buildBankDeeplink } from '@/config/site';
import { useI18n } from '@/i18n';

const KEY = 'ninifood.bank';
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function lastBank(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Телефон: тач-экран без мыши. На десктопе блок не показываем (там «Продолжить на телефоне»). */
export function useMobilePay(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(window.matchMedia('(pointer: coarse)').matches), []);
  return m;
}

/** Кнопка «Оплатить в приложении банка» + список банков. Ссылка открывается в новой вкладке: экран оплаты (скриншот) остаётся. */
export function BankPay({ amount }: { amount: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    setIos(isIos());
    setLast(lastBank());
  }, []);

  const list = BANK_APPS.filter((b) => !ios || b.ios);
  const first = list.find((b) => b.id === last);
  const rows = first ? [first, ...list.filter((b) => b !== first)] : list;

  const pick = (id: string) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* без памяти — не страшно */
    }
    setLast(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[52px] w-full rounded-md2 bg-accent text-base font-extrabold text-white active:bg-accent-dark"
      >
        {t('payment.bankApp')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div className="text-lg font-extrabold text-ink">{t('bank.title')}</div>
              <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm font-bold text-accent">
                {t('bank.close')}
              </button>
            </div>
            <div className="px-5 pb-2 text-xs leading-snug text-ink-muted">{t('bank.note')}</div>
            <ul className="flex-1 overflow-y-auto px-2 pb-3">
              {rows.map((b) => (
                <li key={b.id}>
                  <a
                    href={buildBankDeeplink(b.id, amount)}
                    target="_blank"
                    rel="noopener"
                    onClick={() => pick(b.id)}
                    className="flex items-center gap-3 rounded-md2 px-3 py-2.5 active:bg-sand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bankLogo(b.id, ios)} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg bg-sand object-contain" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-ink">{b.name}</span>
                      <span className={`block text-xs leading-snug text-ink-muted`}>
                        {t(b.fill ? 'bank.fill' : 'bank.nofill')}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
