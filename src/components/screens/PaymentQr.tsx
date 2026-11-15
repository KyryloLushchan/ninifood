'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import { buildQrUrl } from '@/config/site';
import { PHOTOS } from '@/config/photos';
import { withBasePath } from '@/lib/base-path';
import { loadStaticQr, renderQrPng, saveQr, type QrImage } from '@/lib/qr-image';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { SubmitError } from '../ui/SubmitError';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TurnstileWidget } from '../ui/TurnstileWidget';
import { ContinueOnPhone } from '../ui/ContinueOnPhone';
import { ScreenshotUpload } from '../ui/ScreenshotUpload';
import { TwoCol } from '../ui/Layout';

export function PaymentQr() {
  const { t } = useI18n();
  const { go, total, sum, screenshot, captcha, placeOrder, sending, submitError } = useApp();
  const staticQr = withBasePath(PHOTOS.paymentQr);
  const dynamicQr = buildQrUrl();

  // PNG готовим заранее: share() должен вызываться сразу по нажатию, иначе iOS его блокирует.
  // Не получилось (сеть/сервис) — статичный QR.
  const [qr, setQr] = useState<QrImage | null>(null);
  useEffect(() => {
    let dead = false;
    let made: QrImage | null = null;
    setQr(null);
    const name = 'ninifood-qr';
    (async () => {
      try {
        if (!dynamicQr) throw new Error('no vietqr');
        made = await renderQrPng(dynamicQr, `${name}.png`);
      } catch (e) {
        console.warn('[qr] using static qr', e);
        try {
          made = await loadStaticQr(staticQr, 'ninifood-qr.jpg');
        } catch {
          made = null;
        }
      }
      if (dead) {
        if (made) URL.revokeObjectURL(made.url);
        return;
      }
      setQr(made);
    })();
    return () => {
      dead = true;
      if (made) URL.revokeObjectURL(made.url);
    };
  }, [dynamicQr, staticQr]);

  const ok = !!screenshot;

  // Копируется только число (без пробелов и ₫): клиент вставляет его в банковское приложение.
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copyAmount = async () => {
    const text = String(total);
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        done = document.execCommand('copy');
      } catch {
        done = false;
      }
      ta.remove();
    }
    if (!done) return;
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <ScreenHeader title={t('payment.title')} onBack={() => go('checkout')} />
      <TwoCol>
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-6 lg:px-0 lg:pb-0">
        <div className="flex flex-col items-center gap-3 rounded-xl2 bg-card p-5">
          <div className="text-center">
            <div className="text-sm text-ink-2">{t('payment.amountDue')}</div>
            <div className="font-serif text-[32px] font-bold leading-tight">{fmtMoney(total)}</div>
          </div>
          <button type="button" onClick={() => void copyAmount()} className="rounded-md2 border border-accent px-4 py-2 text-sm font-bold text-accent">
            {copied ? `✓ ${t('payment.copied')}` : t('payment.copyAmount')}
          </button>
          <div className="w-full">
            <OrderSummary sum={sum} />
          </div>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr.url} alt="VietQR" className="w-full max-w-[300px] rounded-md2" />
          ) : (
            <div className="aspect-[540/640] w-full max-w-[300px] animate-pulse rounded-md2 bg-sand" />
          )}
          <div className="text-center text-[13px] leading-snug text-ink-muted">
            {t('payment.scan')}
          </div>
          <button type="button" disabled={!qr} onClick={() => qr && void saveQr(qr)} className="text-sm font-bold text-accent hover:underline disabled:opacity-50">
            {t('payment.save')}
          </button>
          <div className="text-center text-xs leading-snug text-ink-muted">{t('payment.saveHint')}</div>
        </div>

        <ScreenshotUpload />
        <TurnstileWidget />
        <ContinueOnPhone />
      </div>
      <BottomBar>
        <Button disabled={!ok || sending || !captcha} onClick={() => void placeOrder()}>
          {t('payment.send')}
        </Button>
        <SubmitError />
        {!ok && <div className="text-center text-[13px] text-ink-muted">{t('payment.needUpload')}</div>}
      </BottomBar>
      </TwoCol>
    </>
  );
}
