'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { Btn, Card, Err, inputCls } from './ui';

interface Vip {
  id: number;
  email: string;
  note: string | null;
}

/** Email из ввода (нижний регистр); null — не похоже на адрес. */
const parseEmail = (raw: string) => {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
};

export function VipCard() {
  const [list, setList] = useState<Vip[] | null>(null);
  const [mail, setMail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminDb.from('vip_customers').select('id, email, note').order('id');
    if (error) setError(ruError(error.message));
    else setList(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const n = parseEmail(mail);
    if (!n) return setError('Введите email клиента, например name@gmail.com.');
    setError('');
    setBusy(true);
    const { error } = await adminDb.from('vip_customers').insert({ email: n, note: note.trim() || null });
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setMail('');
    setNote('');
    void load();
  };

  const remove = async (id: number) => {
    if (confirmId !== id) return setConfirmId(id); // удаление — вторым нажатием
    setConfirmId(null);
    const { error } = await adminDb.from('vip_customers').delete().eq('id', id);
    if (error) setError(ruError(error.message));
    else void load();
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="text-[15px] font-extrabold">VIP-клиенты</div>
        <div className="text-[13px] text-ink-muted">
          Могут заказать на любой день, включая сегодня, но только если вошли на сайте под этим email. Воскресенье по-прежнему недоступно.
        </div>
      </div>
      {!list ? (
        <div className="text-sm text-ink-muted">Загрузка…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-ink-muted">Список пуст.</div>
      ) : (
        list.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 rounded-chip bg-bg px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold">{v.email}</div>
              <div className="truncate text-xs text-ink-muted">
                {v.note ?? 'без заметки'}
              </div>
            </div>
            <Btn kind={confirmId === v.id ? 'danger' : 'ghost'} className="min-h-9 flex-none px-3 text-sm" onClick={() => void remove(v.id)}>
              {confirmId === v.id ? 'Точно удалить?' : 'Удалить'}
            </Btn>
          </div>
        ))
      )}
      <div className="flex flex-col gap-2">
        <input className={inputCls} type="email" placeholder="email клиента" autoCapitalize="none" value={mail} onChange={(e) => setMail(e.target.value)} />
        <input className={inputCls} placeholder="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn onClick={add} disabled={busy || !mail.trim()}>{busy ? 'Добавляем…' : 'Добавить VIP'}</Btn>
      </div>
      <Err>{error}</Err>
    </Card>
  );
}
