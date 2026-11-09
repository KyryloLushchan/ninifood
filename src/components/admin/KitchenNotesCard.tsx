'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { todayISO } from '@/lib/dates';
import { Btn, Card, Err, inputCls } from './ui';
import { useReadOnly } from './role';

interface Note {
  id: number;
  date: string;
  text: string;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** «Заметка кухне на дату»: строка «📝 …» в сообщении «Порции на …» (NiniFood Ops) за этот день. Порции и заказы не меняются. */
export function KitchenNotesCard() {
  const readOnly = useReadOnly();
  const [list, setList] = useState<Note[] | null>(null);
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminDb.from('kitchen_notes').select('id, date, text').gte('date', todayISO()).order('date').order('id');
    if (error) setError(ruError(error.message));
    else setList((data ?? []) as Note[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const t = text.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return setError('Выберите дату.');
    if (t.length < 1 || t.length > 300) return setError('Заметка — от 1 до 300 символов.');
    setError('');
    setBusy(true);
    const { error } = await adminDb.from('kitchen_notes').insert({ date, text: t });
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setText('');
    void load();
  };

  const remove = async (id: number) => {
    if (confirmId !== id) return setConfirmId(id); // удаление — вторым нажатием
    setConfirmId(null);
    const { error } = await adminDb.from('kitchen_notes').delete().eq('id', id);
    if (error) setError(ruError(error.message));
    else void load();
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="text-[15px] font-extrabold">Заметка кухне на дату</div>
        <div className="text-[13px] text-ink-muted">Попадёт строкой «📝 …» в сообщение «Порции на …» за эту дату (NiniFood Ops). Порции и заказы не меняются.</div>
      </div>
      {!list ? (
        <div className="text-sm text-ink-muted">Загрузка…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-ink-muted">Заметок на будущие даты нет.</div>
      ) : (
        list.map((n) => (
          <div key={n.id} className="flex items-center justify-between gap-2 rounded-chip bg-bg px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink-muted">{ddmm(n.date)}</div>
              <div className="break-words text-[15px] font-bold">📝 {n.text}</div>
            </div>
            {!readOnly && (
              <Btn kind={confirmId === n.id ? 'danger' : 'ghost'} className="min-h-9 flex-none px-3 text-sm" onClick={() => void remove(n.id)}>
                {confirmId === n.id ? 'Точно удалить?' : 'Удалить'}
              </Btn>
            )}
          </div>
        ))
      )}
      {!readOnly && (
        <div className="flex flex-col gap-2">
          <input className={inputCls} type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
          <input className={inputCls} placeholder="Текст заметки" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          <Btn onClick={add} disabled={busy || !date || !text.trim()}>{busy ? 'Добавляем…' : 'Добавить заметку'}</Btn>
        </div>
      )}
      <Err>{error}</Err>
    </Card>
  );
}
