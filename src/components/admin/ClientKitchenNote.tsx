'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { Btn, Err, inputCls } from './ui';
import { Modal } from './PortionsEditor';
import { useReadOnly } from './role';

const ERR: Record<string, string> = {
  forbidden: 'Нет прав на изменение комментария.',
  not_found: 'Заказ не найден (возможно, удалён).',
  bad_note: 'Комментарий — от 1 до 300 символов.',
  no_client_key: 'У заказа нет ника, телефона и аккаунта — клиента не определить.',
};

type Mode = null | 'edit' | 'confirm-save' | 'confirm-delete';

/**
 * «📝 Комментарий кухне (постоянный)»: сохраняется на клиента (ник / телефон / аккаунт заказа), действует на все его заказы и дни,
 * пока не удалён. В отчёт кухне (NiniFood Ops) попадает блоком «📝 Особые пометки:». Правка и удаление — с подтверждением;
 * viewer только видит. Запись — RPC `admin_set_client_kitchen_note` (is_admin()); если у клиента сегодня доставка, edge-функция
 * `kitchen-note-notify` отправляет пометку в Ops отдельным сообщением (ночной отчёт уже ушёл).
 */
export function ClientKitchenNote({ o, onNotice }: { o: AdminOrder; onNotice?: (s: string) => void }) {
  const readOnly = useReadOnly();
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminDb.rpc('get_client_kitchen_note', { p_order: o.id });
    if (error) return setNote(null);
    setNote((data as { note?: string } | null)?.note ?? null);
  }, [o.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (mode === 'confirm-save' || mode === 'confirm-delete') cancelRef.current?.focus();
  }, [mode]);

  const close = () => {
    if (busy) return;
    setMode(null);
    setError('');
  };
  const run = async (text: string) => {
    setBusy(true);
    setError('');
    const { error } = await adminDb.rpc('admin_set_client_kitchen_note', { p_order: o.id, p_note: text });
    if (error) {
      setBusy(false);
      const code = Object.keys(ERR).find((c) => error.message.includes(c));
      return setError(code ? ERR[code] : ruError(error.message));
    }
    let extra = '';
    if (text) {
      try {
        const { data } = await adminDb.auth.getSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/kitchen-note-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
          body: JSON.stringify({ order_id: o.id }),
        });
        const body = await res.json().catch(() => ({}));
        if (body.sent) extra = ' Пометка отправлена в NiniFood Ops (у клиента сегодня доставка).';
        else if (!res.ok || !body.ok) extra = ' Но в NiniFood Ops пометка не ушла — отправьте порции повару заново или проверьте группу.';
      } catch {
        extra = ' Но в NiniFood Ops пометка не ушла — проверьте группу.';
      }
    }
    setBusy(false);
    setMode(null);
    setNote(text || null);
    onNotice?.(text ? `Комментарий кухне сохранён для клиента ${o.order_number}.${extra}` : 'Комментарий кухне удалён.');
  };

  if (note === undefined || (readOnly && !note)) return null;
  return (
    <div className="mt-2 rounded-chip bg-bg px-3 py-2 text-sm">
      <div className="text-[13px] font-bold text-ink-muted">📝 Комментарий кухне (постоянный)</div>
      {note ? <div className="mt-0.5 break-words font-bold">{note}</div> : <div className="text-ink-muted">Нет. Действует на все заказы и дни клиента, пока не удалён.</div>}
      {!readOnly && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={() => { setDraft(note ?? ''); setMode('edit'); }}>
            {note ? 'Изменить' : 'Добавить'}
          </Btn>
          {note && (
            <Btn kind="danger" className="!min-h-9 !px-3 !text-sm" onClick={() => setMode('confirm-delete')}>
              Удалить
            </Btn>
          )}
        </div>
      )}
      {mode === 'edit' && (
        <Modal title="Комментарий кухне (постоянный)" onClose={close}>
          <div className="flex flex-col gap-3">
            <div className="text-sm text-ink-muted">Клиент {o.telegram}. Попадёт в отчёт кухне по всем его заказам и дням.</div>
            <textarea className={inputCls} rows={3} maxLength={300} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Например: Соус отдельно" autoFocus />
            <Err>{error}</Err>
            <div className="flex gap-2">
              <button type="button" onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">Отмена</button>
              <Btn kind="ghost" disabled={!draft.trim() || draft.trim() === (note ?? '')} onClick={() => setMode('confirm-save')}>Далее</Btn>
            </div>
          </div>
        </Modal>
      )}
      {mode === 'confirm-save' && (
        <Modal title="Сохранить комментарий?" onClose={close}>
          <div className="flex flex-col gap-3">
            <div className="text-sm leading-relaxed">
              {note ? 'Заменить' : 'Добавить'} для клиента <b>{o.telegram}</b>: «{draft.trim()}». Будет действовать на все его заказы и дни, пока не удалите.
            </div>
            <Err>{error}</Err>
            <div className="flex gap-2">
              <button ref={cancelRef} type="button" autoFocus onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">Отмена</button>
              <Btn kind="ghost" disabled={busy} onClick={() => void run(draft.trim())}>{busy ? 'Сохраняем…' : 'Подтвердить'}</Btn>
            </div>
          </div>
        </Modal>
      )}
      {mode === 'confirm-delete' && (
        <Modal title="Удалить комментарий?" onClose={close}>
          <div className="flex flex-col gap-3">
            <div className="text-sm leading-relaxed">Комментарий «{note}» для клиента <b>{o.telegram}</b> перестанет попадать в отчёт кухне по всем его заказам.</div>
            <Err>{error}</Err>
            <div className="flex gap-2">
              <button ref={cancelRef} type="button" autoFocus onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">Отмена</button>
              <Btn kind="danger" disabled={busy} onClick={() => void run('')}>{busy ? 'Удаляем…' : 'Удалить'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
