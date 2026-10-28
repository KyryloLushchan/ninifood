'use client';

import { useState } from 'react';
import { buildQrUrl } from '@/config/site';
import { PHOTOS } from '@/config/photos';
import { withBasePath } from '@/lib/base-path';
import { paymentNote } from '@/lib/payment-note';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TurnstileWidget } from '../ui/TurnstileWidget';
import { ScreenshotUpload } from '../ui/ScreenshotUpload';

export function PaymentQr() {
  const { t } = useI18n();
  const { go, contact, total, sum, screenshot, captcha, placeOrder, sending, submitError } = useApp();
  const staticQr = withBasePath(PHOTOS.paymentQr);
  const dynamicQr = buildQrUrl(total, paymentNote(contact.telegram, contact.phone));
  // Не загрузился QR с суммой — показываем статичный.
  const [failed, setFailed] = useState(false);
  const qrUrl = dynamicQr && !failed ? dynamicQr : staticQr;

  // Скачиваем именно показанную картинку (с суммой): svg → png через canvas; не вышло — открываем в новой вкладке.
  const saveQr = async () => {
    try {
      const blob = await (await fetch(qrUrl)).blob();
      let out = blob;
      if (blob.type.includes('svg')) {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((ok, bad) => {
          img.onload = () => ok();
          img.onerror = () => bad(new Error('svg load'));
          img.src = url;
        });
        const c = document.createElement('canvas');
        c.width = 2 * (img.naturalWidth || 540);
        c.height = 2 * (img.naturalHeight || 640);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        out = await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('png'))), 'image/png'));
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out);
      a.download = `ninifood-qr-${total}.${out.type.includes('png') ? 'png' : 'jpg'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      console.warn('[qr] save failed, opening image', e);
      window.open(qrUrl, '_blank', 'noopener');
    }
  };
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="VietQR" onError={() => setFailed(true)} className="w-full max-w-[300px] rounded-md2" />
          <div className="text-center text-[13px] leading-snug text-ink-muted">
            {t('payment.scan')}
          </div>
          <button type="button" onClick={() => void saveQr()} className="text-sm font-bold text-accent hover:underline">
            {t('payment.save')}
          </button>
        </div>

        <ScreenshotUpload />
        <TurnstileWidget />
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
