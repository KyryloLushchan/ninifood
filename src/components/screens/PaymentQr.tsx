'use client';

import { buildQrUrl } from '@/config/site';
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
  const { go, total, sum, screenshot, captcha, placeOrder, sending, submitError } = useApp();
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
