'use client';

import { DELIVERY_FROM, DELIVERY_TO } from '@/config/site';
import { useI18n } from '@/i18n';
import { labelList } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { useApp } from '@/state/app-context';
import { Button } from '../ui/Button';
import { Logo } from '../ui/ScreenHeader';

export function Thanks() {
  const { t, lang } = useI18n();
  const { placed, reset, settings } = useApp();
  if (!placed) return null;

  const rows: [string, string][] = [
    [t('thanks.orderNo'), placed.orderId],
    [t('thanks.days'), labelList(placed.days, lang)],
    [t('thanks.portions'), t('thanks.portionsValue', { n: placed.portions })],
    [t('thanks.delivery'), `${DELIVERY_FROM}–${DELIVERY_TO}`],
    [t('thanks.payment'), `${placed.payment === 'qr' ? t('thanks.payQr') : placed.payment === 'other' ? t('thanks.payOther') : t('thanks.payCash')} · ${fmtMoney(placed.total)}`],
  ];

  const dot = 'box-border h-[18px] w-[18px] flex-none rounded-full border-2 border-disabled bg-card';
  const line = <div className="min-h-7 w-0.5 flex-1 bg-disabled" />;

  return (
    <>
      <div className="px-5 py-4">
        <Logo />
      </div>
      <div className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-success-bg text-[34px] font-extrabold text-success">✓</div>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.15]">{t('thanks.title')}</h1>

        <div className="flex flex-col">
          <div className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <div className="h-[18px] w-[18px] flex-none rounded-full bg-success" />
              {line}
            </div>
            <div className="-mt-0.5 pb-4 text-base font-extrabold text-success">{t('thanks.s1')}</div>
          </div>
          <div className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <div className={dot} />
              {line}
            </div>
            <div className="-mt-0.5 flex flex-col gap-0.5 pb-4">
              <span className="text-[13px] font-bold text-ink-muted">{t('thanks.s2time')}</span>
              <span className="text-base font-extrabold">{t('thanks.s2')}</span>
            </div>
          </div>
          <div className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <div className={dot} />
            </div>
            <div className="-mt-0.5 flex flex-col gap-0.5">
              <span className="text-[13px] font-bold text-ink-muted">{t('thanks.s3time')}</span>
              <span className="text-base font-extrabold">{t('thanks.s3')}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-lg2 bg-card p-4">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 text-[15px]">
              <span className="text-ink-muted">{k}</span>
              <b className="text-right">{v}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-5 pb-6 pt-4">
        <Button onClick={reset}>{t('thanks.home')}</Button>
        <div className="text-center text-sm text-ink-2">
          {t('thanks.question')}{' '}
          <a href={settings.telegramUrl} target="_blank" rel="noreferrer">
            {t('thanks.questionLink')}
          </a>
        </div>
      </div>
    </>
  );
}
