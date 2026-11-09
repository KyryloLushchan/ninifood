'use client';

import { useEffect, useRef, useState } from 'react';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Err } from './ui';
import { Modal } from './PortionsEditor';

const ERR: Record<string, string> = {
  forbidden: 'Нет прав на изменение заказа.',
  not_found: 'Заказ не найден (возможно, удалён).',
  order_not_active: 'Заказ не активен (отменён или доставлен).',
};

/**
 * «Такси» (флаг заказа `orders.taxi`): заказ не участвует в рейсах, ссылках маршрута и км/адресах ЗП, курьеру показывается отдельным блоком
 * «🚕 Такси: …» (отчёт, группа курьера, вкладка «Курьер»); порции кухне считаются как обычно. Окно подтверждения («Отмена» в фокусе; Enter, Esc, клик мимо = отмена).
 */
export function TaxiToggle({ o, onChanged, onNotice }: { o: AdminOrder; onChanged: () => void; onNotice?: (s: string) => void }) {
  const on = o.taxi === true;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);
  if (!['new', 'confirmed'].includes(o.status)) return on ? <span className="text-sm font-bold">🚕 Такси</span> : null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError('');
  };
  const save = async () => {
    setBusy(true);
    setError('');
    const { error } = await adminDb.rpc('admin_set_taxi', { p_order: o.id, p_value: !on });
    setBusy(false);
    if (error) {
      const code = Object.keys(ERR).find((c) => error.message.includes(c));
      return setError(code ? ERR[code] : ruError(error.message));
    }
    setOpen(false);
    onNotice?.(on ? `Заказ ${o.order_number} снова в маршруте курьера.` : `Заказ ${o.order_number} отправляется такси: в рейсы не входит, курьеру — отдельным блоком «🚕 Такси».`);
    onChanged();
  };

  return (
    <>
      <Btn kind={on ? 'outline' : 'ghost'} className="!min-h-9 !px-3 !text-sm" onClick={() => setOpen(true)}>
        {on ? '🚕 Такси: вкл' : '🚕 Такси'}
      </Btn>
      {open && (
        <Modal title={on ? 'Вернуть заказ курьеру?' : 'Отправить заказ такси?'} onClose={close}>
          <div
            className="flex flex-col gap-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className="text-sm leading-relaxed">
              Заказ <b>{o.order_number}</b> · {tgLabel(o.telegram)}
              <div className="mt-1 text-ink-muted">
                {on
                  ? 'Заказ снова попадёт в рейсы курьера, ссылки маршрута, км и расчёт ЗП.'
                  : 'Заказ не будет участвовать в рейсах, ссылках маршрута и расчёте км/адресов ЗП. Курьеру он покажется отдельным блоком «🚕 Такси» (отчёт, группа курьера, вкладка «Курьер»). Порции для кухни считаются как обычно. Если маршрут на день уже опубликован, группа обновится сама в течение нескольких минут.'}
              </div>
            </div>
            <Err>{error}</Err>
            <div className="flex gap-2">
              <button ref={cancelRef} type="button" autoFocus onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">
                Отмена
              </button>
              <Btn kind="ghost" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Подтвердить'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
