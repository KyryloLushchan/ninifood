'use client';

import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/state/app-context';
import { Button } from './Button';

/**
 * Ошибка отправки заказа. При сетевой/общей ошибке заказ остаётся на экране: кнопка «Попробовать ещё раз»
 * (тот же ключ запроса — дубля не будет) и подсказка написать в Telegram.
 */
export function SubmitError() {
  const { t } = useI18n();
  const { submitError, placeOrder, sending, captcha, settings } = useApp();
  if (!submitError) return null;
  const retryable = submitError === 'error.network' || submitError === 'error.generic';
  return (
    <>
      <div className="text-center text-[13px] font-bold text-accent">{t(submitError as TKey)}</div>
      {retryable && (
        <>
          <Button variant="outline" size="md" disabled={sending || !captcha} onClick={() => void placeOrder()}>
            {t('error.retry')}
          </Button>
          <div className="text-center text-[13px] text-ink-muted">
            {t('error.writeUs')}{' '}
            <a href={settings.telegramUrl} target="_blank" rel="noreferrer" className="font-bold text-accent">
              {settings.telegramHandle}
            </a>
          </div>
        </>
      )}
    </>
  );
}
