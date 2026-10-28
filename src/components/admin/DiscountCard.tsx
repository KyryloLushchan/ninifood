'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { Btn, Card, Err, inputCls } from './ui';

interface Discount {
  id: number;
  email: string;
  percent: number;
  note: string | null;
  valid_until: string | null;
}

const parseEmail = (raw: string) => {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
};
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('.');

export function DiscountCard() {
  const [list, setList] = useState<Discount[] | null>(null);
  const [mail, setMail] = useState('');
  const [percent, setPercent] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminDb.from('customer_discounts').select('id, email, percent, note, valid_until').order('id');
    if (error) setError(ruError(error.message));
    else setList(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const e = parseEmail(mail);
    const p = Number(percent);
    if (!e) return setError('Введите email клиента, например name@gmail.com.');
    if (!Number.isInteger(p) || p < 1 || p > 100) return setError('Скидка — целое число от 1 до 100 %.');
    setError('');
    setBusy(true);
    const { error } = await adminDb.from('customer_discounts').insert({ email: e, percent: p, valid_until: until || null, note: note.trim() || null });
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setMail('');
    setPercent('');
    setUntil('');
    setNote('');
    void load();
  };

  const remove = async (id: number) => {
    if (confirmId !== id) return setConfirmId(id); // удаление — вторым нажатием
    setConfirmId(null);
    const { error } = await adminDb.from('customer_discounts').delete().eq('id', id);
    if (error) setError(ruError(error.message));
    else void load();
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="text-[15px] font-extrabold">Персональные скидки</div>
        <div className="text-[13px] text-ink-muted">
          Действуют только если клиент вошёл на сайте под этим email. Скидка — на обеды (разовые и подписка), доставка без скидки. Сумма скидки округляется до 1 000 ₫ в пользу клиента.
        </div>
      </div>
      {!list ? (
        <div className="text-sm text-ink-muted">Загрузка…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-ink-muted">Список пуст.</div>
      ) : (
        list.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-chip bg-bg px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold">
                {d.email} · {d.percent}%
              </div>
              <div className="truncate text-xs text-ink-muted">
                {d.valid_until ? `до ${ddmmyyyy(d.valid_until)}` : 'бессрочно'}
                {d.note ? ` · ${d.note}` : ''}
              </div>
            </div>
            <Btn kind={confirmId === d.id ? 'danger' : 'ghost'} className="min-h-9 flex-none px-3 text-sm" onClick={() => void remove(d.id)}>
              {confirmId === d.id ? 'Точно удалить?' : 'Удалить'}
            </Btn>
          </div>
        ))
      )}
      <div className="flex flex-col gap-2">
        <input className={inputCls} type="email" placeholder="email клиента" autoCapitalize="none" value={mail} onChange={(e) => setMail(e.target.value)} />
        <input className={inputCls} inputMode="numeric" placeholder="Скидка, % (1–100)" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Действует до (необязательно, включительно)
          <input className={inputCls} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <input className={inputCls} placeholder="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn onClick={add} disabled={busy || !mail.trim() || !percent}>{busy ? 'Добавляем…' : 'Добавить скидку'}</Btn>
      </div>
      <Err>{error}</Err>
    </Card>
  );
}
