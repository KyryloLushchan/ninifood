'use client';

import { useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { Btn, Err, inputCls } from './ui';

/**
 * «Указать точку» для заказа без координат: ссылка Google Maps (в т.ч. короткая maps.app.goo.gl) или «lat, lng».
 * Ссылку разбирает edge-функция resolve-point (короткие разворачиваются на сервере); координаты сохраняются в заказ,
 * дальше список/маршрут пересчитывается (onSaved).
 */
export function PinPoint({ orderId, onSaved }: { orderId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ input: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.code === 'not_found' ? 'Не нашёл координаты в Дананге. Вставьте ссылку Google Maps с точкой или «lat, lng», например 16.0544, 108.2478.' : body.code === 'forbidden' ? 'Нет прав.' : 'Не удалось разобрать ссылку. Попробуйте ещё раз.');
        return;
      }
      const { error } = await adminDb.from('orders').update({ lat: body.lat, lng: body.lng, place_id: null }).eq('id', orderId);
      if (error) return setError(ruError(error.message));
      setOpen(false);
      setValue('');
      onSaved();
    } catch (e) {
      setError(ruError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <Btn kind="outline" className="mt-2 !min-h-9 w-full !px-3 !text-sm" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        📍 Указать точку (нет координат)
      </Btn>
    );
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md2 border border-line bg-sand/40 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="text-[13px] font-bold text-ink-2">Ссылка Google Maps (maps.app.goo.gl/…, google.com/maps/…@lat,lng…, ?q=lat,lng) или «lat, lng»</div>
      <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://maps.app.goo.gl/… или 16.0544, 108.2478" inputMode="url" autoCapitalize="none" autoCorrect="off" />
      <Err>{error}</Err>
      <div className="flex gap-2">
        <Btn className="flex-1" disabled={busy || !value.trim()} onClick={save}>{busy ? 'Ищем…' : 'Сохранить точку'}</Btn>
        <Btn kind="ghost" onClick={() => setOpen(false)}>Отмена</Btn>
      </div>
    </div>
  );
}
