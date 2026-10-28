'use client';

import { useState } from 'react';
import { SUB_MIN_DAYS } from '@/config/site';
import { useI18n } from '@/i18n';
import { addDays, ddmm, labelFull, weekdayShort, weekStart } from '@/lib/dates';
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
      <div className="flex flex-1 flex-col gap-[18px] px-5">
        <div className="grid grid-cols-2 rounded-chip bg-sand p-1" role="tablist">
          <button role="tab" aria-selected={orderType === 'once'} className={seg(orderType === 'once')} onClick={() => setOrderType('once')}>
            {t('order.tabOnce')}
          </button>
          <button role="tab" aria-selected={orderType === 'sub'} className={seg(orderType === 'sub')} onClick={() => setOrderType('sub')}>
            {t('order.tabSub')}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <div className="text-[17px] font-extrabold">{t('sub.portionsTitle')}</div>
            {orderType === 'sub' && <div className="text-xs text-ink-muted">{t('sub.portionsHint')}</div>}
          </div>
          <Stepper value={portions} onChange={setPortions} />
        </div>

        {orderType === 'once' ? <OnceDays /> : <SubDays />}

      </div>
      <OrderBar />
    </>
  );
}

/** Недели Пн–Вс, 7 колонок; воскресенье — неактивная ячейка «вихідний». Дней вне списка `days` — пустые ячейки. */
function WeekGrid({ days, isSelected, onToggle }: { days: string[]; isSelected: (d: string) => boolean; onToggle: (d: string) => void }) {
  const { t, lang } = useI18n();
  const { today, isVip } = useApp();
  const weeks = new Map<string, string[]>();
  for (const d of days) {
    const k = weekStart(d);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  return (
    <>
      {[...weeks.entries()].map(([monday, list]) => {
        const sunday = addDays(monday, 6);
        return (
          <div key={monday} className="flex flex-col gap-1.5">
            <div className="text-xs font-extrabold tracking-[.06em] text-ink-muted">
              {ddmm(list[0])} – {ddmm(list[list.length - 1])}
            </div>
            <div className="grid grid-cols-7 gap-0.5 min-[360px]:gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const d = list.find((x) => new Date(`${x}T00:00:00Z`).getUTCDay() === i + 1);
                if (d) return <DayChip key={i} weekday={weekdayShort(d, lang)} date={ddmm(d)} selected={isSelected(d)} onClick={() => onToggle(d)} />;
                const iso = addDays(monday, i);
                // Сегодня обычным клиентам недоступно — серая ячейка (VIP выбирает сегодня как обычный день).
                return iso === today && !isVip ? <DayChip key={i} weekday={weekdayShort(iso, lang)} date={ddmm(iso)} selected={false} dayOff={t('calendar.today')} onClick={() => {}} /> : <div key={i} />;
              })}
              <DayChip weekday={weekdayShort(sunday, lang)} date={ddmm(sunday)} selected={false} dayOff={t('calendar.dayOff')} onClick={() => {}} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function OnceDays() {
  const { t, lang, pl } = useI18n();
  const { today, bookableDays, onceDays, toggleOnceDay, setOrderType, settings, isVip, discount } = useApp();
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
        <WeekGrid days={bookableDays} isSelected={(d) => onceDays.includes(d)} onToggle={toggleOnceDay} />
      </div>
      {showNudge && (
        <div className="flex flex-col gap-1.5 rounded-md2 bg-accent-soft px-4 py-3.5">
          <div className="text-[15px] font-extrabold">{t('order.nudgeTitle')}</div>
          <div className="text-sm leading-snug text-ink-2">
            {t('order.nudgeText', { n, sub: fmtMoney(subTotals(n, 1, settings.priceSub, SUB_MIN_DAYS, settings.deliverySingle, discount).total), once: fmtMoney(onceTotals(n, 1, settings.priceSingle, settings.deliverySingle, discount).total) })}
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
  const { subscriptionDays, subDays, toggleSubDay } = useApp();
  const count = subDays.length;


  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-extrabold">{t('sub.pickTitle')}</div>
        <div className="flex items-center gap-2">
          <div className={`text-[15px] font-extrabold ${count >= SUB_MIN_DAYS ? 'text-success' : 'text-accent'}`}>{t('sub.count', { n: count })}</div>
        </div>
      </div>
      <div className="-mt-1 text-[13px] text-ink-muted">{t('sub.autoHint')}</div>
      <WeekGrid days={subscriptionDays} isSelected={(d) => subDays.includes(d)} onToggle={toggleSubDay} />
    </div>
  );
}

function OrderBar() {
  const { t, pl } = useI18n();
  const { orderType, onceDays, subDays, portions, sum, go } = useApp();

  if (orderType === 'once') {
    const n = onceDays.length;
    return (
      <BottomBar compact>
        <OrderSummary compact sum={sum} title={`${t('summary.food')} · ${n} ${pl('unit.day', n)} × ${portions} ${pl('unit.portion', portions)}`} />
        <Button disabled={n === 0} onClick={() => go('checkout')}>
          {t('order.next')}
        </Button>
      </BottomBar>
    );
  }
  const left = SUB_MIN_DAYS - subDays.length;
  return (
    <BottomBar compact>
      <OrderSummary compact sum={sum} title={`${t('summary.food')} · ${subDays.length} ${pl('unit.day', subDays.length)} × ${portions} ${pl('unit.portion', portions)}`} />
      <Button disabled={left > 0} onClick={() => go('checkout')}>
        {left > 0 ? t('sub.more', { n: left }) : t('order.next')}
      </Button>
    </BottomBar>
  );
}
