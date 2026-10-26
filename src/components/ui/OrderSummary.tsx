'use client';

import { useI18n } from '@/i18n';
import { fmtMoney } from '@/lib/format';
import type { Totals } from '@/lib/pricing';

/** Сводка суммы: «Обеды», «Доставка», «Итого» отдельными строками. */
export function OrderSummary({ sum, title, big }: { sum: Totals; title?: string; big?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm text-ink-2">
        <span>{title ?? t('summary.food')}</span>
        <span className="font-bold text-ink">{fmtMoney(sum.food)}</span>
      </div>
      <div className="flex items-baseline justify-between text-sm text-ink-2">
        <span>{t('summary.delivery')}</span>
        <span className="font-bold text-ink">{fmtMoney(sum.delivery)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-sm font-extrabold">{t('summary.total')}</span>
        <span className={`font-serif font-bold ${big ? 'text-[32px]' : 'text-screen'}`}>{fmtMoney(sum.total)}</span>
      </div>
    </div>
  );
}
