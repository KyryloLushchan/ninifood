'use client';

import { useState } from 'react';
import { SUB_MIN_DAYS, TODAY_ORDER_DEADLINE } from '@/config/site';
import { useI18n } from '@/i18n';
import { ddmm, labelFull, weekdayShort, weekStart } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { onceTotals, subTotals } from '@/lib/pricing';
import { useApp } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { DayChip } from '../ui/DayChip';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Stepper } from '../ui/Stepper';

export function Order() {
  const { t } = useI18n();
  const { orderType, setOrderType, portions, setPortions, go } = useApp();

  const seg = (active: boolean) =>
    `h-[42px] rounded-[11px] text-[15px] ${active ? 'bg-card font-extrabold shadow-seg' : 'font-bold text-ink-2'}`;

  return (
    <>
      <ScreenHeader title={t('order.title')} onBack={() => go('home')} />
      <div className="flex flex-1 flex-col gap-[22px] px-5">
        <div className="grid grid-cols-2 rounded-chip bg-sand p-1" role="tablist">
          <button role="tab" aria-selected={orderType === 'once'} className={seg(orderType === 'once')} onClick={() => setOrderType('once')}>
            {t('order.tabOnce')}
          </button>
          <button role="tab" aria-selected={orderType === 'sub'} className={seg(orderType === 'sub')} onClick={() => setOrderType('sub')}>
            {t('order.tabSub')}
          </button>
        </div>

        {orderType === 'once' ? <OnceDays /> : <SubDays />}

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="text-[17px] font-extrabold">{t(orderType === 'once' ? 'order.portionsTitle' : 'sub.portionsTitle')}</div>
            <div className="text-[13px] text-ink-muted">{t(orderType === 'once' ? 'order.portionsHint' : 'sub.portionsHint')}</div>
          </div>
          <Stepper value={portions} onChange={setPortions} />
        </div>
      </div>
      <OrderBar />
    </>
  );
}

function OnceDays() {
  const { t, lang, pl } = useI18n();
  const { today, bookableDays, onceDays, toggleOnceDay, setOrderType, settings, isVip } = useApp();
  const n = onceDays.length;
  const showNudge = n >= SUB_MIN_DAYS;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <div className="text-[17px] font-extrabold">{t('order.daysTitle')}</div>
          <div className="text-sm text-ink-muted">
            {n ? t('order.selected', { text: `${n} ${pl('unit.day', n)}` }) : t('order.pickDay')}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {bookableDays.map((d) => (
            <DayChip key={d} weekday={weekdayShort(d, lang)} date={ddmm(d)} selected={onceDays.includes(d)} onClick={() => toggleOnceDay(d)} />
          ))}
        </div>
        {today && !isVip && (
          <div className="text-[13px] text-ink-muted">
            {t('order.todayNote', { day: labelFull(today, lang) })}{' '}
            <a href={settings.telegramUrl} target="_blank" rel="noreferrer">
              {t('order.todayLink', { time: TODAY_ORDER_DEADLINE })}
            </a>
          </div>
        )}
      </div>
      {showNudge && (
        <div className="flex flex-col gap-1.5 rounded-md2 bg-accent-soft px-4 py-3.5">
          <div className="text-[15px] font-extrabold">{t('order.nudgeTitle')}</div>
          <div className="text-sm leading-snug text-ink-2">
            {t('order.nudgeText', { n, sub: fmtMoney(subTotals(n, 1, settings.priceSub, SUB_MIN_DAYS, settings.deliverySingle).total), once: fmtMoney(onceTotals(n, 1, settings.priceSingle, settings.deliverySingle).total) })}
          </div>
          <button onClick={() => setOrderType('sub')} className="self-start text-sm font-extrabold text-accent hover:underline">
            {t('order.nudgeCta')}
          </button>
        </div>
      )}
    </>
  );
}

function SubDays() {
  const { t, lang } = useI18n();
  const { subscriptionDays, menu, subDays, toggleSubDay } = useApp();
  const count = subDays.length;

  const weeks = new Map<string, string[]>();
  for (const d of subscriptionDays) {
    const k = weekStart(d);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-extrabold">{t('sub.pickTitle')}</div>
        <div className="flex items-center gap-2">
          <div className={`text-[15px] font-extrabold ${count >= SUB_MIN_DAYS ? 'text-success' : 'text-accent'}`}>{t('sub.count', { n: count })}</div>
        </div>
      </div>
      <div className="-mt-1 text-[13px] text-ink-muted">{t('sub.autoHint')}</div>
      {[...weeks.entries()].map(([monday, list]) => (
        <div key={monday} className="flex flex-col gap-1.5">
          <div className="text-xs font-extrabold tracking-[.06em] text-ink-muted">
            {ddmm(list[0])} – {ddmm(list[list.length - 1])}
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const d = list.find((x) => new Date(`${x}T00:00:00Z`).getUTCDay() === i + 1);
              return d ? (
                <DayChip key={i} weekday={weekdayShort(d, lang)} date={ddmm(d)} selected={subDays.includes(d)} noMenu={!menu[d]} onClick={() => toggleSubDay(d)} />
              ) : (
                <div key={i} />
              );
            })}
          </div>
        </div>
      ))}
      {subscriptionDays.some((d) => !menu[d]) && (
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          <span className="h-3.5 w-5 rounded-[5px] border border-dashed border-ink-muted" />
          {t('home.noDays')}
        </div>
      )}
    </div>
  );
}

function OrderBar() {
  const { t, pl } = useI18n();
  const { orderType, onceDays, subDays, portions, sum, go } = useApp();

  if (orderType === 'once') {
    const n = onceDays.length;
    return (
      <BottomBar>
        <OrderSummary sum={sum} title={`${t('summary.food')} · ${n} ${pl('unit.day', n)} × ${portions} ${pl('unit.portion', portions)}`} />
        <Button disabled={n === 0} onClick={() => go('checkout')}>
          {t('order.next')}
        </Button>
      </BottomBar>
    );
  }
  const left = SUB_MIN_DAYS - subDays.length;
  return (
    <BottomBar>
      <OrderSummary sum={sum} title={`${t('summary.food')} · ${subDays.length} ${pl('unit.day', subDays.length)} × ${portions} ${pl('unit.portion', portions)}`} />
      <Button disabled={left > 0} onClick={() => go('checkout')}>
        {left > 0 ? t('sub.more', { n: left }) : t('order.next')}
      </Button>
    </BottomBar>
  );
}
