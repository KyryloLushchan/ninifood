'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { Btn, Card, Err, inputCls } from './ui';

interface Vip {
  id: number;
  telegram_username: string;
  telegram_id: number | null;
  note: string | null;
}

/** Ник из ввода: «@Name», «t.me/Name», «Name» → name; null — не похоже на ник Telegram. */
const parseNick = (raw: string) => {
  const n = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{4,32}$/.test(n) ? n : null;
};

export function VipCard() {
  const [list, setList] = useState<Vip[] | null>(null);
  const [nick, setNick] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminDb.from('vip_customers').select('id, telegram_username, telegram_id, note').order('id');
    if (error) setError(ruError(error.message));
    else setList(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const n = parseNick(nick);
    if (!n) return setError('Введите ник Telegram: 4–32 символа, латиница, цифры и _.');
    setError('');
    setBusy(true);
    const { error } = await adminDb.from('vip_customers').insert({ telegram_username: n, note: note.trim() || null });
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setNick('');
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
          Могут заказать на любой день, включая сегодня, но только если вошли на сайте через Telegram. После первого входа привязываются к Telegram id (дальше смена ника не мешает).
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
              <div className="truncate text-[15px] font-bold">@{v.telegram_username}</div>
              <div className="truncate text-xs text-ink-muted">
                {v.telegram_id ? 'привязан к id' : 'ещё не входил'}
                {v.note ? ` · ${v.note}` : ''}
              </div>
            </div>
            <Btn kind={confirmId === v.id ? 'danger' : 'ghost'} className="min-h-9 flex-none px-3 text-sm" onClick={() => void remove(v.id)}>
              {confirmId === v.id ? 'Точно удалить?' : 'Удалить'}
            </Btn>
          </div>
        ))
      )}
      <div className="flex flex-col gap-2">
        <input className={inputCls} placeholder="@ник" autoCapitalize="none" value={nick} onChange={(e) => setNick(e.target.value)} />
        <input className={inputCls} placeholder="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn onClick={add} disabled={busy || !nick.trim()}>{busy ? 'Добавляем…' : 'Добавить VIP'}</Btn>
      </div>
      <Err>{error}</Err>
    </Card>
  );
}
