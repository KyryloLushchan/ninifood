'use client';

import { useRef } from 'react';
import { buildQrUrl } from '@/config/site';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';

export function PaymentQr() {
  const { t } = useI18n();
  const { go, total, sum, screenshot, setScreenshot, placeOrder, sending, submitError } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const qrUrl = buildQrUrl(total);
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
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="VietQR" width={220} height={220} className="h-[220px] w-[220px] rounded-md2" />
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded-md2 bg-stripes-qr">
              <span className="rounded-md bg-card px-2 py-1 font-mono text-xs text-ink-muted">{t('payment.qrPlaceholder')}</span>
            </div>
          )}
          <div className="text-center text-[13px] leading-snug text-ink-muted">
            {t('payment.scan')}
          </div>
          {qrUrl && (
            <a href={qrUrl} download="ninifood-qr.png" target="_blank" rel="noreferrer" className="text-sm">
              {t('payment.save')}
            </a>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[17px] font-extrabold">
            {t('payment.shotTitle')} <span className="text-accent">*</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setScreenshot(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg2 border-2 border-dashed p-3 ${
              ok ? 'border-success bg-success-bg2' : 'border-accent bg-card'
            }`}
          >
            <span className={`break-all text-[15px] font-extrabold ${ok ? 'text-success' : 'text-accent'}`}>
              {ok ? `✓ ${screenshot.name}` : t('payment.upload')}
            </span>
            <span className="text-[13px] text-ink-muted">{ok ? t('payment.replace') : t('payment.uploadHint')}</span>
          </button>
        </div>
      </div>
      <BottomBar>
        <Button disabled={!ok || sending} onClick={() => void placeOrder()}>
          {t('payment.send')}
        </Button>
        {submitError && <div className="text-center text-[13px] font-bold text-accent">{t(submitError as TKey)}</div>}
        {!ok && <div className="text-center text-[13px] text-ink-muted">{t('payment.needUpload')}</div>}
      </BottomBar>
    </>
  );
}
