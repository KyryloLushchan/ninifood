'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays } from '@/lib/dates';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { fmtRub, payLine, type CourierDayPay } from '@/lib/admin/courier-pay';
import { loadPayrollRange, type PayrollData } from '@/lib/admin/payroll-load';
import { useReadOnly } from './role';
import { Btn, Card, Err, inputCls } from './ui';

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const FIELD_LABEL: Record<string, string> = { addresses: 'адреса', km: 'км' };

interface LogRow {
  id: number;
  at: string;
  courier: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  by_email: string | null;
}

/** «ЗП курьера» за выбранный день во вкладке «Курьер»: строка расчёта по каждому курьеру; админ может поправить адреса и км до выплаты (журнал правок). */
export function CourierPayBlock({ date, refreshKey }: { date: string; refreshKey: unknown }) {
  const readOnly = useReadOnly();
  const [data, setData] = useState<PayrollData | null | undefined>(undefined);
  const [log, setLog] = useState<LogRow[]>([]);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<{ courier: number; addresses: string; km: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await loadPayrollRange([date]));
      const { data: l } = await adminDb.from('courier_pay_log').select('id, at, courier, field, old_value, new_value, by_email').eq('date', date).order('id', { ascending: false }).limit(8);
      setLog((l ?? []) as LogRow[]);
    } catch (e) {
      setError(ruError((e as Error).message));
    }
  }, [date]);
  useEffect(() => {
    setData(undefined);
    setEdit(null);
    void load();
  }, [load, refreshKey]);

  if (data === undefined) return error ? <Err>{error}</Err> : null;
  if (!data || data.days.length === 0) return null;

  const save = async (d: CourierDayPay) => {
    if (!edit) return;
    const a = edit.addresses.trim() === '' ? null : Number(edit.addresses);
    const k = edit.km.trim() === '' ? null : Number(edit.km.replace(',', '.'));
    if ((a !== null && (!Number.isInteger(a) || a < 0 || a > 500)) || (k !== null && (!Number.isFinite(k) || k < 0 || k > 2000))) return setError('Проверьте адреса (целое число) и км (число).');
    setBusy(true);
    setError('');
    const { error } = await adminDb.from('courier_pay_days').upsert({ date, courier: d.courier, addresses_manual: a === d.autoAddresses ? null : a, km_manual: k === d.autoKm ? null : k }, { onConflict: 'date,courier' });
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setEdit(null);
    void load();
  };
  const reset = async (d: CourierDayPay) => {
    setBusy(true);
    setError('');
    const { error } = await adminDb.from('courier_pay_days').delete().eq('date', date).eq('courier', d.courier);
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setEdit(null);
    void load();
  };
  const multi = data.days.length > 1;

  return (
    <div className="flex flex-col gap-2">
      {data.days.map((d) => (
        <Card key={d.courier} className="flex flex-col gap-1.5">
          <div className="text-sm font-extrabold">💰 ЗП курьера{multi ? ` · курьер ${d.courier}` : ''}</div>
          <div className="text-[15px] font-bold">{payLine(d, data.pay)}</div>
          <div className="text-xs text-ink-muted">
            {d.paid ? '✅ выплачено' : d.manual ? `✏️ правка вручную (расчёт: ${d.autoAddresses} адр., ${d.autoKm} км)` : 'расчёт по маршруту; не выплачено'}
          </div>
          {!readOnly && !d.paid &&
            (edit?.courier === d.courier ? (
              <div className="mt-1 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} inputMode="numeric" placeholder="Адресов" value={edit.addresses} onChange={(e) => setEdit({ ...edit, addresses: e.target.value.replace(/\D/g, '') })} />
                  <input className={inputCls} inputMode="decimal" placeholder="Км (спидометр)" value={edit.km} onChange={(e) => setEdit({ ...edit, km: e.target.value.replace(/[^\d.,]/g, '') })} />
                </div>
                <div className="flex gap-2">
                  <Btn className="!min-h-9 flex-1 !text-sm" disabled={busy} onClick={() => save(d)}>Сохранить</Btn>
                  {d.manual && <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" disabled={busy} onClick={() => reset(d)}>К расчёту</Btn>}
                  <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={() => setEdit(null)}>Отмена</Btn>
                </div>
              </div>
            ) : (
              <Btn kind="ghost" className="mt-1 !min-h-9 self-start !px-3 !text-sm" onClick={() => setEdit({ courier: d.courier, addresses: String(d.addresses), km: String(d.km) })}>
                Поправить адреса / км
              </Btn>
            ))}
        </Card>
      ))}
      <Err>{error}</Err>
      {log.length > 0 && (
        <div className="px-1 text-xs text-ink-muted">
          Правки: {log.map((l) => `${new Intl.DateTimeFormat('ru', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(l.at))} · ${l.by_email || 'админ'} · ${FIELD_LABEL[l.field] ?? l.field}: ${l.old_value ?? 'расчёт'} → ${l.new_value ?? 'расчёт'}`).join(' | ')}
        </div>
      )}
    </div>
  );
}

/** «ЗП курьера» за период во вкладке «Деньги»: по дням и курьерам, итог к выплате и выплачено (расход «ЗП курьера» попадает в кассу и прибыль при выплате). */
export function PayrollCard({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<PayrollData | null | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(undefined);
    setError('');
    const dates: string[] = [];
    for (let d = from; d <= to && dates.length <= 62; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) dates.push(d);
    if (dates.length > 62) {
      setData(null);
      return;
    }
    loadPayrollRange(dates).then(setData).catch((e) => setError(ruError((e as Error).message)));
  }, [from, to]);

  if (error) return <Err>{error}</Err>;
  if (data === undefined) return null;
  if (data === null) return <Card><div className="text-sm text-ink-muted">ЗП курьера по дням показывается для периодов до 2 месяцев; выплаченные суммы — в расходах (категория «ЗП курьера»).</div></Card>;
  if (data.days.length === 0) return null;
  const paid = data.days.filter((d) => d.paid).reduce((s, d) => s + d.total, 0);
  const due = data.days.filter((d) => !d.paid).reduce((s, d) => s + d.total, 0);
  const multi = new Set(data.days.map((d) => d.courier)).size > 1;
  return (
    <Card className="flex flex-col gap-1.5 divide-y divide-line">
      <div className="text-sm text-ink-muted">ЗП курьера</div>
      <div className="flex flex-col gap-1 py-2 text-[13px]">
        {data.days.map((d) => (
          <div key={`${d.date}-${d.courier}`} className="flex flex-col">
            <span className="font-bold">{dm(d.date)}{multi ? ` · курьер ${d.courier}` : ''}{d.paid ? ' ✅' : d.manual ? ' ✏️' : ''}</span>
            <span className="text-ink-2">ЗП курьера: {payLine(d, data.pay)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between pt-2 text-sm">
        <span>К выплате</span>
        <b>{fmtRub(due)}</b>
      </div>
      <div className="flex justify-between text-sm">
        <span>Выплачено</span>
        <b>{fmtRub(paid)}</b>
      </div>
    </Card>
  );
}
