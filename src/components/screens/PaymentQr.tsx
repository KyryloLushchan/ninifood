'use client';

import { useEffect, useState } from 'react';
import { buildQrUrl } from '@/config/site';
import { PHOTOS } from '@/config/photos';
import { withBasePath } from '@/lib/base-path';
import { loadStaticQr, renderQrPng, saveQr, type QrImage } from '@/lib/qr-image';
import { paymentNote } from '@/lib/payment-note';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TurnstileWidget } from '../ui/TurnstileWidget';
import { ContinueOnPhone } from '../ui/ContinueOnPhone';
import { ScreenshotUpload } from '../ui/ScreenshotUpload';

export function PaymentQr() {
  const { t } = useI18n();
  const { go, contact, total, sum, screenshot, captcha, placeOrder, sending, submitError } = useApp();
  const staticQr = withBasePath(PHOTOS.paymentQr);
  const dynamicQr = buildQrUrl(total, paymentNote(contact.telegram, contact.phone));

  // PNG готовим заранее: share() должен вызываться сразу по нажатию, иначе iOS его блокирует.
  // Не получилось (сеть/сервис) — статичный QR.
  const [qr, setQr] = useState<QrImage | null>(null);
  useEffect(() => {
    let dead = false;
    let made: QrImage | null = null;
    setQr(null);
    const name = `ninifood-qr-${total}`;
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
  }, [dynamicQr, staticQr, total]);

  const ok = !!screenshot;

  return (
    <>
      <ScreenHeader title={t('payment.title')} onBack={() => go('checkout')} />
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-6">
        <div className="flex flex-col items-center gap-3 rounded-xl2 bg-card p-5">
          <div className="text-sm text-ink-2">{t('payment.due')}</div>
          <div className="w-full">
            <OrderSummary sum={sum} big />
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
        {submitError && <div className="text-center text-[13px] font-bold text-accent">{t(submitError as TKey)}</div>}
        {!ok && <div className="text-center text-[13px] text-ink-muted">{t('payment.needUpload')}</div>}
      </BottomBar>
    </>
  );
}
