'use client';

import { useEffect, useState } from 'react';
import { useI18n, type TKey } from '@/i18n';
import { customerDb } from '@/lib/customer-auth';
import { labelList } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { useApp } from '@/state/app-context';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Narrow } from '../ui/Layout';

interface Row {
  order_number: string;
  created_at: string;
  type: 'single' | 'subscription';
  total: number;
  status: 'new' | 'confirmed' | 'delivered' | 'cancelled';
  order_days: { delivery_date: string }[];
}

const STATUS_STYLE: Record<Row['status'], string> = {
  new: 'bg-accent-soft text-accent',
  confirmed: 'bg-success-bg text-success',
  delivered: 'bg-success-bg text-success',
  cancelled: 'bg-sand text-ink-muted',
};

export function MyOrders() {
  const { t, lang } = useI18n();
  const { go } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    customerDb
      .from('orders')
      .select('order_number, created_at, type, total, status, order_days(delivery_date)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setFailed(true);
        else setRows((data ?? []) as Row[]);
      });
  }, []);

  return (
    <Narrow>
      <ScreenHeader title={t('auth.myOrders')} onBack={() => go('home')} />
      <div className="flex flex-1 flex-col gap-3 px-5 pb-8">
        {failed ? (
          <div className="py-8 text-center text-[15px] text-ink-muted">{t('orders.error')}</div>
        ) : !rows ? (
          <div className="py-8 text-center text-[15px] text-ink-muted">…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-[15px] text-ink-muted">{t('orders.empty')}</div>
        ) : (
          rows.map((r) => (
            <div key={r.order_number} className="flex flex-col gap-1.5 rounded-md2 bg-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-extrabold">{r.order_number}</div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${STATUS_STYLE[r.status]}`}>{t(`orders.status.${r.status}` as TKey)}</span>
              </div>
              <div className="text-sm text-ink-2">
                {t(r.type === 'single' ? 'order.tabOnce' : 'order.tabSub')} · {labelList(r.order_days.map((d) => d.delivery_date), lang)}
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">{new Date(r.created_at).toLocaleDateString(lang === 'ua' ? 'uk' : lang, { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                <span className="font-extrabold">{fmtMoney(r.total)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Narrow>
  );
}
