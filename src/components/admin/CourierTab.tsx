'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, labelFull, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import type { LatLng } from '@/lib/admin/route';
import { hhmm, lateWarning, parseTripSettings, planAssignment, planDay, stopKey, type CourierTrips, type RouteOverride } from '@/lib/admin/trips';
import { subLabel } from '@/lib/admin/sub-label';
import { formatPhone, phoneHref } from '@/lib/phone';
import { tgHref, tgLabel } from '@/lib/admin/telegram-link';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { Btn, Card, Err, Note, inputCls } from './ui';
import { PinPoint } from './PinPoint';
import { useReadOnly } from './role';

interface Row {
  id: number;
  delivery_date: string;
  qty: number;
  delivered: boolean;
  orders: {
    id: string;
    order_number: string;
    type: 'single' | 'subscription';
    status: 'new' | 'confirmed' | 'delivered';
    telegram: string;
    phone: string | null;
    address: string;
    lat: number | null;
    lng: number | null;
    hotel: string | null;
    comment: string | null;
    payment_method: 'qr' | 'cash' | 'other';
    total: number;
    cutlery: boolean;
    order_days: { delivery_date: string }[];
  };
}

/** Наличные берём в ПЕРВЫЙ день доставки заказа, дальше — «оплачено». */
const cashDue = (r: Row) =>
  r.orders.payment_method === 'cash' && r.delivery_date === [...r.orders.order_days].map((d) => d.delivery_date).sort()[0]
    ? r.orders.total
    : 0;

/** Номер этого дня среди дней заказа. */
const dayNo = (r: Row) => [...r.orders.order_days].map((d) => d.delivery_date).sort().indexOf(r.delivery_date) + 1;

export function CourierTab() {
  const readOnly = useReadOnly();
  const [date, setDate] = useState(() => addDays(todayISO(), 1));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [kitchen, setKitchen] = useState<LatLng | null>(null);
  const [couriers, setCouriers] = useState<1 | 2>(1);
  const [trip, setTrip] = useState(() => parseTripSettings({}));
  const [override, setOverride] = useState<RouteOverride | null>(null);
  const [savingMove, setSavingMove] = useState(false);

  // Кухня, число курьеров и параметры рейсов — из Настроек; переключатель ниже действует только на выбранную дату.
  useEffect(() => {
    adminDb.from('settings').select('key, value').in('key', ['kitchen_lat', 'kitchen_lng', 'couriers_count', 'trip_capacity', 'courier_speed_kmh', 'stop_minutes', 'road_factor', 'depart_time', 'deadline_time', 'trip_gap_min']).then(({ data }) => {
      const c = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      setTrip(parseTripSettings(c));
      const lat = Number(c.kitchen_lat);
      const lng = Number(c.kitchen_lng);
      if (c.kitchen_lat && c.kitchen_lng && Number.isFinite(lat) && Number.isFinite(lng)) setKitchen({ lat, lng });
      setCouriers(c.couriers_count === '2' ? 2 : 1);
    });
  }, []);

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await adminDb
      .from('order_days')
      .select(
        'id, delivery_date, qty, delivered, orders!inner(id, order_number, type, status, telegram, phone, address, lat, lng, hotel, comment, payment_method, total, cutlery, order_days(delivery_date))',
      )
      .eq('delivery_date', date)
      .in('orders.status', ['new', 'confirmed', 'delivered']) // доставленные остаются в плане (серыми), чтобы рейсы не «плыли» в течение дня
      .order('id');
    if (error) setError(ruError(error.message));
    else setRows((data ?? []) as unknown as Row[]);
  }, [date]);

  useEffect(() => {
    setRows(null);
    setNotice('');
    load();
  }, [load]);

  // Ручное распределение точек по рейсам на выбранную дату (если есть).
  useEffect(() => {
    setOverride(null);
    adminDb.from('route_overrides').select('couriers, assign').eq('date', date).maybeSingle().then(({ data }) => {
      if (data) setOverride({ couriers: data.couriers === 2 ? 2 : 1, assign: (data.assign ?? {}) as RouteOverride['assign'] });
    });
  }, [date]);

  const toggle = async (r: Row) => {
    const { error } = await adminDb.from('order_days').update({ delivered: !r.delivered }).eq('id', r.id);
    if (error) setError(ruError(error.message));
    else load(); // статус заказа меняет триггер в БД
  };

  // «Подтверждённые» = confirmed + delivered (доставленные остаются в плане); ждущие подтверждения (new) — в плане с пометкой ⏳.
  const confirmed = (rows ?? []).filter((r) => r.orders.status !== 'new');
  const pending = (rows ?? []).filter((r) => r.orders.status === 'new');
  const sum = (l: Row[]) => l.reduce((s, r) => s + r.qty, 0);
  const cutleryCount = (l: Row[]) => l.filter((r) => r.orders.cutlery).length;

  // Рейсы: те же функции, что у ночного отчёта (`planDay`: рейсы по вместимости, время, ручное распределение).
  const plan = useMemo(
    () =>
      kitchen && rows
        ? planDay([...rows].sort((a, b) => a.orders.order_number.localeCompare(b.orders.order_number)), { lat: (r) => r.orders.lat, lng: (r) => r.orders.lng, address: (r) => r.orders.address, qty: (r) => r.qty }, kitchen, couriers, trip, override)
        : null,
    [rows, kitchen, couriers, trip, override],
  );

  // Точки доставки — как «Адресов» в ночном отчёте: заказы на одной точке считаются одной остановкой.
  const stopCount = plan ? plan.couriers.reduce((n, c) => n + c.trips.reduce((m, t) => m + t.stops.length, 0), 0) + plan.noPoint.length : confirmed.length;

  // Ручной перенос точки в другой рейс (того же курьера): сохраняем всё текущее распределение дня, пересчёт — на лету.
  const moveStop = async (key: string, courier: number, tripNo: number) => {
    if (!plan) return;
    const assign = { ...planAssignment(plan), [key]: { c: courier, t: tripNo } };
    const next: RouteOverride = { couriers, assign };
    setSavingMove(true);
    setError('');
    const { data: u } = await adminDb.auth.getUser();
    const { error } = await adminDb.from('route_overrides').upsert({ date, couriers, assign, updated_at: new Date().toISOString(), updated_by: u.user?.email ?? null }, { onConflict: 'date' });
    setSavingMove(false);
    if (error) setError(ruError(error.message));
    else setOverride(next);
  };
  const resetOverride = async () => {
    setSavingMove(true);
    setError('');
    const { error } = await adminDb.from('route_overrides').delete().eq('date', date);
    setSavingMove(false);
    if (error) setError(ruError(error.message));
    else setOverride(null);
  };

  const rowText = (r: Row, label: string, eta?: number) => {
    const due = cashDue(r);
    return [
      `${label}) ${eta != null ? `≈${hhmm(eta)} ` : ''}${r.orders.status === 'new' ? '⏳ (не подтверждён) ' : ''}${r.orders.address}${r.orders.hotel ? ` (${r.orders.hotel})` : ''}`,
      `   Telegram: ${tgLabel(r.orders.telegram)}`,
      ...(r.orders.phone ? [`   Тел.: ${formatPhone(r.orders.phone)}`] : []),
      ...(r.orders.type === 'subscription' ? [`   ${subLabel(r.orders.order_days.length)}, день ${dayNo(r)} из ${r.orders.order_days.length}`] : []),
      `   ПОРЦИЙ: ${r.qty}`,
      ...(r.orders.cutlery ? ['   ПРИБОРЫ: ДА'] : []),
      `   ${r.delivered ? 'Доставлено' : due ? `Взять наличными: ${fmtMoney(due)}` : 'Оплачено'}`,
      ...(r.orders.comment ? [`   Комментарий: ${r.orders.comment}`] : []),
      '',
    ];
  };

  /** Текст для курьера (копирование): рейсы, точки по порядку со временем + ссылки Google Maps каждого рейса. */
  const courierText = (cr: CourierTrips<Row>, title: string) => {
    const all = cr.trips.flatMap((t) => t.stops.flatMap((st) => st.stop.items));
    const lines = [`${title} на ${labelFull(date, 'ru')} — ${cr.trips.reduce((n, t) => n + t.stops.length, 0)} адр., ${sum(all)} порц., рейсов: ${cr.trips.length}, приборов: ${cutleryCount(all)}, ${km(cr.totalKm)}`, ''];
    let no = 0;
    cr.trips.forEach((t, ti) => {
      lines.push(`РЕЙС ${ti + 1} — ${t.portions} порц. · ${km(t.km)} · ${hhmm(t.startMin)}–${hhmm(t.endMin)}`, '');
      t.stops.forEach((st) => {
        no++;
        st.stop.items.forEach((row, k) => lines.push(...rowText(row, st.stop.items.length > 1 ? `${no}.${k + 1}` : String(no), st.arriveMin)));
      });
      t.links.forEach((u, i) => lines.push(`Маршрут рейса ${ti + 1}${t.links.length > 1 ? ` (${i + 1}/${t.links.length})` : ''}: ${u}`));
      lines.push('');
    });
    return lines.join('\n').trim();
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Не удалось скопировать — разрешите доступ к буферу обмена');
    }
  };

  // Ручной запуск той же функции, что и ночной cron: отчёт на выбранную дату и с выбранным числом курьеров уходит в группу Orders.
  const sendReport = async () => {
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ date, couriers, parts: 'courier' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(
          body.code === 'forbidden' ? 'Нет прав на отправку отчёта.' : body.code === 'telegram_failed' ? 'Telegram не принял сообщение. Попробуйте ещё раз.' : 'Не удалось отправить отчёт. Попробуйте ещё раз.',
        );
      } else if (body.skipped) {
        setNotice('Воскресенье — выходной, отчёт не отправляется.');
      } else {
        setNotice(body.addresses > 0 ? `Отправлено в Telegram: ${body.addresses} адр., курьеров: ${body.couriers ?? couriers}` : 'Отправлено: доставок на эту дату нет.');
      }
    } catch (e) {
      setError(ruError((e as Error).message));
    } finally {
      setSending(false);
    }
  };

  // Порции для повара (группа NiniFood Ops): заказанные порции на выбранную дату + запас; шлёт та же функция daily-report.
  const [sendingKitchen, setSendingKitchen] = useState(false);
  const sendKitchen = async () => {
    setSendingKitchen(true);
    setError('');
    setNotice('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ date, couriers, parts: 'kitchen' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.code === 'forbidden' ? 'Нет прав на отправку.' : 'Не удалось отправить порции повару (подробности — в группе Orders). Попробуйте ещё раз.');
      } else if (body.skipped) {
        setNotice('Воскресенье — выходной, порции не отправляются.');
      } else {
        const k = body.kitchen;
        setNotice(k ? `Отправлено повару: ${k.portions} + ${k.extra} = ${k.total}${k.cutlery ? `, приборов: ${k.cutlery}` : ''}` : 'Отправлено повару.');
      }
    } catch (e) {
      setError(ruError((e as Error).message));
    } finally {
      setSendingKitchen(false);
    }
  };

  const DeliveryCard = ({ r, label, eta, onSaved }: { r: Row; label: string; eta?: number; onSaved?: () => void }) => {
    const due = cashDue(r);
    const href = tgHref(r.orders.telegram);
    return (
      <Card className={r.delivered ? 'bg-success-bg2 opacity-80' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2.5">
            <div className="flex flex-none flex-col items-center gap-1">
              <div className="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-1 text-[13px] font-extrabold text-white">{label}</div>
              {eta != null && <div className="text-[11px] font-bold text-ink-muted">≈{hhmm(eta)}</div>}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              {r.orders.status === 'new' && <div className="text-xs font-extrabold text-accent">⏳ не подтверждён</div>}
              <div className="text-[15px] font-extrabold">{r.orders.address}</div>
              {r.orders.hotel && <div className="text-sm text-ink-2">🏨 {r.orders.hotel}</div>}
              <div className="text-sm">
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {tgLabel(r.orders.telegram)}
                  </a>
                ) : (
                  tgLabel(r.orders.telegram)
                )}
                <span className="text-ink-muted"> · {r.orders.order_number}</span>
              </div>
              {r.orders.phone && (
                <div className="text-sm">
                  📞 <a href={phoneHref(r.orders.phone)}>{formatPhone(r.orders.phone)}</a>
                </div>
              )}
              {r.orders.type === 'subscription' && (
                <div className="text-sm text-ink-2">🔁 {subLabel(r.orders.order_days.length)} · день {dayNo(r)} из {r.orders.order_days.length}</div>
              )}
              {r.orders.comment && <div className="text-sm text-ink-muted">💬 {r.orders.comment}</div>}
            </div>
          </div>
          <div className="flex-none text-right">
            <div className="text-[24px] font-extrabold leading-none">{r.qty} <span className="text-[15px]">{plural(r.qty)}</span></div>
            {r.orders.cutlery && <div className="mt-1.5 inline-block rounded-full bg-accent px-2.5 py-1 text-[13px] font-extrabold text-white">🍴 Приборы</div>}
            <div className={`text-sm font-bold ${due && !r.delivered ? 'text-accent' : 'text-success'}`}>{r.delivered ? 'доставлено' : due ? `к получению: ${fmtMoney(due)}` : 'оплачено'}</div>
          </div>
        </div>
        {r.orders.lat == null && onSaved && !readOnly && <PinPoint orderId={r.orders.id} onSaved={onSaved} />}
        {!readOnly && (
          <Btn kind={r.delivered ? 'ghost' : 'primary'} className="mt-3 w-full" onClick={() => toggle(r)}>
            {r.delivered ? '✓ Доставлено (отменить)' : 'Доставлено'}
          </Btn>
        )}
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-8">
      <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-3">
      <div className="flex items-center gap-2">
        <Btn kind="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Раньше">←</Btn>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
        <Btn kind="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="Позже">→</Btn>
      </div>
      <div className="text-center text-sm font-bold text-ink-2">{labelFull(date, 'ru')}</div>
      {!readOnly && (
      <div className="flex items-center justify-between gap-3 rounded-md2 border border-line bg-card px-4 py-2.5">
          <span className="text-sm font-extrabold">Курьеров на этот день</span>
          <div className="grid grid-cols-2 rounded-chip bg-sand p-1" role="radiogroup" aria-label="Число курьеров">
            {([1, 2] as const).map((n) => (
              <button key={n} role="radio" aria-checked={couriers === n} onClick={() => setCouriers(n)} className={`h-9 w-12 rounded-[10px] text-[15px] ${couriers === n ? 'bg-card font-extrabold shadow-seg' : 'font-bold text-ink-2'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      <Err>{error}</Err>
      {notice && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{notice}</div>}

      {rows && (
        <Card className="flex flex-col gap-1">
          <div className="text-[17px] font-extrabold">
            {sum(confirmed)} порций <span className="text-sm font-bold text-ink-muted">· подтверждено, {stopCount} адресов · {confirmed.length} заказов · приборов: {cutleryCount(confirmed)}</span>
          </div>
          {pending.length > 0 && (
            <div className="text-sm font-bold text-accent">
              ещё не подтверждено: {sum(pending)} порций ({pending.length} зак.)
            </div>
          )}
        </Card>
      )}

      {rows === null && <Note>Загрузка…</Note>}
      {rows && confirmed.length === 0 && <Note>На эту дату подтверждённых доставок нет</Note>}
      {rows && confirmed.length > 0 && !kitchen && <Err>Не задан адрес кухни (Настройки → Курьеры) — маршрут не построен.</Err>}

      </div>

      <div className={`contents lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:grid lg:items-start lg:gap-6 ${couriers === 2 ? 'lg:grid-cols-2' : ''}`}>
      {plan?.manual && (
        <div className="flex items-center justify-between gap-3 rounded-md2 border border-line bg-accent-soft px-4 py-2.5 text-sm font-bold lg:col-span-full">
          <span>✋ Ручное распределение по рейсам на этот день (используется и в отчёте)</span>
          {!readOnly && <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={resetOverride} disabled={savingMove}>Сбросить к авто</Btn>}
        </div>
      )}
      {plan && !plan.manual && override && (
        <div className="flex items-center justify-between gap-3 rounded-md2 border border-line bg-sand px-4 py-2.5 text-sm font-bold lg:col-span-full">
          <span>Ручное распределение сделано для {override.couriers} курьер(а) — при {couriers} не применяется</span>
          {!readOnly && <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={resetOverride} disabled={savingMove}>Сбросить</Btn>}
        </div>
      )}
      {plan?.couriers.map((cr, ri) => {
        const all = cr.trips.flatMap((t) => t.stops.flatMap((st) => st.stop.items));
        const key = `r${ri}`;
        const warn = lateWarning(cr, couriers, ri);
        let no = 0;
        return (
          <section key={key} className="flex flex-col gap-3">
            <div className="rounded-md2 border border-line bg-sand/50 px-4 py-3">
              <div className="text-[17px] font-extrabold">{couriers === 2 ? `🛵 Курьер ${ri + 1}` : '🛵 Маршрут'}</div>
              <div className="text-sm text-ink-2">
                {cr.trips.reduce((n, t) => n + t.stops.length, 0)} адр. · {sum(all)} порц. · рейсов {cr.trips.length} · приборов: {cutleryCount(all)} · {km(cr.totalKm)}
              </div>
              {warn && <div className="mt-1 text-sm font-extrabold text-danger">{warn}</div>}
            </div>
            {cr.trips.map((t, ti) => (
              <div key={ti} className="flex flex-col gap-3">
                <div className={`rounded-md2 border px-4 py-2.5 ${t.overCapacity ? 'border-danger bg-danger-bg' : 'border-line bg-card'}`}>
                  <div className="text-[16px] font-extrabold">🚚 Рейс {ti + 1} — {t.portions} порц. · {km(t.km)} · {hhmm(t.startMin)}–{hhmm(t.endMin)}</div>
                  {t.overCapacity && <div className="text-sm font-extrabold text-danger">🔴 больше вместимости ({t.portions} из {trip.capacity})</div>}
                </div>
                {t.stops.map((ts) => {
                  no++;
                  const n = no;
                  const canNew = t.stops.length > 1; // в новый рейс переносим, только если в этом рейсе есть ещё точки
                  const targets = Array.from({ length: cr.trips.length + (canNew ? 1 : 0) }, (_, i) => i + 1).filter((x) => x !== ti + 1);
                  return (
                    <div key={ts.key} className="flex flex-col gap-2">
                      {targets.length > 0 && !readOnly && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-ink-muted">Точка {n}:</span>
                          {targets.map((x) => (
                            <Btn key={x} kind="ghost" className="!min-h-8 !px-2.5 !text-xs" disabled={savingMove} onClick={() => moveStop(ts.key, ri + 1, x)}>
                              → Рейс {x}{x > cr.trips.length ? ' (новый)' : ''}
                            </Btn>
                          ))}
                        </div>
                      )}
                      {ts.stop.items.map((r, k) => <DeliveryCard key={r.id} r={r} eta={ts.arriveMin} label={ts.stop.items.length > 1 ? `${n}.${k + 1}` : String(n)} />)}
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  {t.links.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="flex min-h-11 flex-1 items-center justify-center rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent hover:bg-accent-soft/60 hover:no-underline">
                      🗺 Маршрут рейса {ti + 1}{t.links.length > 1 ? ` · часть ${i + 1}/${t.links.length}` : ''}{t.closed ? ' (с возвратом)' : ''}
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <Btn kind="outline" onClick={() => copyText(key, courierText(cr, couriers === 2 ? `Курьер ${ri + 1}` : 'Доставка'))}>
              {copied === key ? 'Скопировано ✓' : 'Скопировать список'}
            </Btn>
          </section>
        );
      })}

      {plan && plan.noPoint.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="rounded-md2 border border-danger bg-danger-bg px-4 py-3 text-sm font-extrabold text-danger">⚠️ Без точки на карте — распределить/проверить вручную ({plan.noPoint.length})</div>
          {plan.noPoint.map((r, i) => <DeliveryCard key={r.id} r={r} label={String(i + 1)} onSaved={load} />)}
        </section>
      )}
      {!kitchen && confirmed.map((r, i) => <DeliveryCard key={r.id} r={r} label={String(i + 1)} />)}
      </div>

      {!readOnly && (
        <>
      <Btn kind="outline" className="lg:col-start-2 lg:row-start-2 lg:!px-3 lg:!text-sm" onClick={sendReport} disabled={sending}>
        {sending ? 'Отправляем…' : `Отправить отчёт в Telegram (курьеров: ${couriers})`}
      </Btn>
      <Btn kind="outline" className="lg:col-start-2 lg:row-start-3 lg:!px-3 lg:!text-sm" onClick={sendKitchen} disabled={sendingKitchen}>
        {sendingKitchen ? 'Отправляем…' : 'Отправить порции повару'}
      </Btn>
        </>
      )}
    </div>
  );
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'ПОРЦИЯ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'ПОРЦИИ' : 'ПОРЦИЙ');
const km = (n: number) => `≈ ${(Math.round(n * 10) / 10).toString().replace('.', ',')} км`;
