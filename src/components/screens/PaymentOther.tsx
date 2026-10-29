'use client';

import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TurnstileWidget } from '../ui/TurnstileWidget';
import { ContinueOnPhone } from '../ui/ContinueOnPhone';
import { ScreenshotUpload } from '../ui/ScreenshotUpload';
import { TwoCol } from '../ui/Layout';

/** Оплата «Другой способ»: как экран QR, но без QR-кода — способ уточняется в Telegram, скриншот обязателен. */
export function PaymentOther() {
  const { t } = useI18n();
  const { go, sum, settings, screenshot, captcha, placeOrder, sending, submitError } = useApp();
  const ok = !!screenshot;

  return (
    <>
      <ScreenHeader title={t('payment.title')} onBack={() => go('checkout')} />
      <TwoCol>
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-6 lg:px-0 lg:pb-0">
        <div className="flex flex-col items-center gap-3 rounded-xl2 bg-card p-5">
          <div className="text-center text-[15px] leading-snug text-ink-2">{t('payment.otherText')}</div>
          <a
            href={settings.telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-[52px] w-full items-center justify-center rounded-md2 border-2 border-accent text-base font-extrabold text-accent hover:bg-accent-soft/60 hover:no-underline active:bg-accent-soft"
          >
            {t('payment.writeTelegram')}
          </a>
          <div className="text-sm text-ink-2">{t('payment.due')}</div>
          <div className="w-full">
            <OrderSummary sum={sum} big />
          </div>
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
      </TwoCol>
    </>
  );
}
