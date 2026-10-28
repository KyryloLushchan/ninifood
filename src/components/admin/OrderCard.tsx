'use client';

import { useState, type ReactNode } from 'react';
import { orderMessageUrl } from '@/config/site';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { labelShort } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { ruError } from '@/lib/admin/errors';
import { adminDb, PAYMENT_LABEL, STATUS_LABEL, type AdminOrder, type OrderStatus } from '@/lib/admin/client';
import { subLabel } from '@/lib/admin/sub-label';
import { formatPhone, phoneHref } from '@/lib/phone';
import { tgHref, tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Card, Err, inputCls } from './ui';

export const fmtCreated = (iso: string) =>
  new Intl.DateTimeFormat('ru', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Карточка заказа админки (одна на «Заказы» и «Подписки»): шапка по нажатию раскрывает все поля,
 * ручную смену статуса, отметку доставки по дням и удаление. `head` заменяет шапку (ссылки внутри не должны раскрывать карточку — stopPropagation).
 */
export function OrderCard({
  o,
  adminEmail,
  onChanged,
  onNotice,
  head,
  className = '',
}: {
  o: AdminOrder;
  adminEmail: string;
  /** Данные изменились (статус, доставка, удаление) — перечитать список. */
  onChanged: () => void;
  onNotice?: (s: string) => void;
  head?: ReactNode;
  className?: string;
}) {
  const [isOpen, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [delFor, setDelFor] = useState(false);
  const [delText, setDelText] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const lost = o.tg_message_id === null;
  const days = [...o.order_days].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const href = tgHref(o.telegram);

  const setOrderStatus = async (next: OrderStatus) => {
    const { error } = await adminDb.from('orders').update({ status: next, status_changed_at: new Date().toISOString(), status_changed_by: adminEmail }).eq('id', o.id);
    if (error) setError(ruError(error.message));
    else onChanged();
  };

  // Отметка доставки по дню; когда доставлены все дни, триггер БД сам ставит заказу «Доставлен».
  const toggleDay = async (d: AdminOrder['order_days'][number]) => {
    const { error } = await adminDb.from('order_days').update({ delivered: !d.delivered }).eq('id', d.id);
    if (error) setError(ruError(error.message));
    else onChanged();
  };

  // Удаление через edge-функцию: она удаляет заказ, проверяет, что вызывает админ, и правит сообщение в Telegram.
  const deleteOrder = async () => {
    setDelBusy(true);
    setError('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ id: o.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.code === 'forbidden' ? 'Нет прав на удаление.' : body.code === 'not_found' ? 'Заказ уже удалён.' : 'Не удалось удалить заказ. Попробуйте ещё раз.');
      } else {
        onNotice?.(body.telegram === 'failed' ? `Заказ ${o.order_number} удалён, но сообщение в Telegram изменить не удалось.` : `Заказ ${o.order_number} удалён.`);
        onChanged();
      }
    } catch (e) {
      setError(ruError((e as Error).message));
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <Card className={`${lost ? 'border-danger bg-danger-bg' : ''} ${className}`}>
      <div role="button" tabIndex={0} aria-expanded={isOpen} className="cursor-pointer text-left" onClick={() => setOpen(!isOpen)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(!isOpen))}>
        {head ?? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-extrabold">
                {o.order_number} <span className="text-sm font-bold text-ink-muted">· {fmtCreated(o.created_at)}</span>
              </div>
              <div className="text-sm text-ink-2">
                {o.type === 'single' ? `Разовый · ${days.length} дн.` : subLabel(days.length)} × {o.qty} · {PAYMENT_LABEL[o.payment_method]}
              </div>
            </div>
            <div className="text-right">
              <div className="font-serif text-[17px] font-bold">{fmtMoney(o.total)}</div>
              <div className="text-xs text-ink-muted">обеды {fmtMoney(o.total - o.delivery_total + o.discount_amount)} · дост. {fmtMoney(o.delivery_total)}</div>
              {o.discount_amount > 0 && <div className="text-xs font-bold text-success">скидка {o.discount_percent}%: −{fmtMoney(o.discount_amount)}</div>}
              <div className="text-xs font-extrabold text-accent">{STATUS_LABEL[o.status]}</div>
            </div>
          </div>
        )}
      </div>
      {lost && <div className="mt-2 text-sm font-extrabold text-danger">⚠ Не дошёл в Telegram</div>}

      {isOpen && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
          <Err>{error}</Err>
          <div>
            <b>Заказ:</b> {o.order_number} · {fmtCreated(o.created_at)} · {fmtMoney(o.total)} · {PAYMENT_LABEL[o.payment_method]} · {STATUS_LABEL[o.status]}
          </div>
          <div>
            <b>Telegram:</b>{' '}
            {href ? (
              <a href={href} target="_blank" rel="noreferrer">
                {tgLabel(o.telegram)}
              </a>
            ) : (
              tgLabel(o.telegram)
            )}
          </div>
          {o.phone && (
            <div>
              <b>Телефон:</b> <a href={phoneHref(o.phone)}>{formatPhone(o.phone)}</a>
            </div>
          )}
          <div><b>Адрес:</b> {o.address}</div>
          {o.hotel && <div><b>Отель:</b> {o.hotel}</div>}
          {o.comment && <div><b>Комментарий:</b> {o.comment}</div>}
          <div><b>Язык:</b> {(o.lang ?? '—').toUpperCase()}</div>
          <div>
            <b>Дни</b> <span className="text-ink-muted">(нажмите, чтобы отметить доставку)</span>
            <ul className="mt-1 flex flex-col gap-1">
              {days.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => toggleDay(d)} className="flex min-h-9 w-full items-center gap-2 rounded-chip border border-line px-3 text-left hover:bg-sand">
                    <span>{d.delivered ? '✅' : '⬜'}</span>
                    <span>{labelShort(d.delivery_date, 'ru')} · {d.qty} порц.</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {o.status_changed_by && (
            <div className="text-ink-muted">
              Статус изменил: {o.status_changed_by}
              {o.status_changed_at ? `, ${fmtCreated(o.status_changed_at)}` : ''}
            </div>
          )}
          {o.tg_message_id !== null && (
            <a href={orderMessageUrl(o.tg_message_id)} target="_blank" rel="noreferrer">
              Открыть сообщение в группе Orders →
            </a>
          )}
          <div className="mt-2">
            <div className="mb-1 text-[13px] font-bold text-ink-muted">Сменить статус вручную</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as OrderStatus[])
                .filter((s) => s !== o.status)
                .map((s) => (
                  <Btn key={s} kind={s === 'cancelled' ? 'danger' : 'ghost'} className="!min-h-9 !px-3 !text-sm" onClick={() => setOrderStatus(s)}>
                    → {STATUS_LABEL[s]}
                  </Btn>
                ))}
            </div>
            <div className="mt-1 text-xs text-ink-muted">Сообщение в Telegram при этом не меняется.</div>
          </div>
          <div className="mt-2 border-t border-line pt-3">
            {!delFor ? (
              <Btn kind="danger" className="!min-h-9 !px-3 !text-sm" onClick={() => { setDelFor(true); setDelText(''); }}>
                Удалить заказ
              </Btn>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="text-[13px] font-bold text-danger">
                  Заказ будет удалён полностью и перестанет учитываться в деньгах. Введите номер заказа ({o.order_number}), чтобы подтвердить.
                </div>
                <input className={inputCls} value={delText} onChange={(e) => setDelText(e.target.value)} placeholder={o.order_number} autoCapitalize="characters" />
                <div className="flex gap-2">
                  <Btn kind="danger" disabled={delBusy || delText.trim().toUpperCase() !== o.order_number} onClick={deleteOrder}>
                    {delBusy ? 'Удаляем…' : 'Удалить навсегда'}
                  </Btn>
                  <Btn kind="ghost" onClick={() => setDelFor(false)}>Отмена</Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
