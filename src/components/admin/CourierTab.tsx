'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, labelFull, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { LONG_ROUTE_KM, planRoutes, type LatLng, type Route } from '@/lib/admin/route';
import { subLabel } from '@/lib/admin/sub-label';
import { formatPhone, phoneHref } from '@/lib/phone';
import { tgHref, tgLabel } from '@/lib/admin/telegram-link';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { Btn, Card, Err, Note, inputCls } from './ui';
import { PinPoint } from './PinPoint';

interface Row {
  id: number;
  delivery_date: string;
  qty: number;
  delivered: boolean;
  orders: {
    id: string;
    order_number: string;
    type: 'single' | 'subscription';
    status: 'new' | 'confirmed';
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
  const [date, setDate] = useState(() => addDays(todayISO(), 1));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [kitchen, setKitchen] = useState<LatLng | null>(null);
  const [couriers, setCouriers] = useState<1 | 2>(1);

  // Кухня и число курьеров по умолчанию — из Настроек; переключатель ниже действует только на выбранную дату.
  useEffect(() => {
    adminDb.from('settings').select('key, value').in('key', ['kitchen_lat', 'kitchen_lng', 'couriers_count']).then(({ data }) => {
      const c = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
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
      .in('orders.status', ['new', 'confirmed'])
      .order('id');
    if (error) setError(ruError(error.message));
    else setRows((data ?? []) as unknown as Row[]);
  }, [date]);

  useEffect(() => {
    setRows(null);
    setNotice('');
    load();
  }, [load]);

  const toggle = async (r: Row) => {
    const { error } = await adminDb.from('order_days').update({ delivered: !r.delivered }).eq('id', r.id);
    if (error) setError(ruError(error.message));
    else load(); // статус заказа меняет триггер в БД
  };

  const confirmed = (rows ?? []).filter((r) => r.orders.status === 'confirmed');
  const pending = (rows ?? []).filter((r) => r.orders.status === 'new');
  const sum = (l: Row[]) => l.reduce((s, r) => s + r.qty, 0);
  const cutleryCount = (l: Row[]) => l.filter((r) => r.orders.cutlery).length;

  // Маршрут: те же функции, что у ночного отчёта (haversine × 1.3, nearest neighbor + 2-opt; при 2 курьерах — секторы вокруг кухни).
  const plan = useMemo(
    () => (kitchen ? planRoutes(confirmed, { lat: (r) => r.orders.lat, lng: (r) => r.orders.lng, address: (r) => r.orders.address, qty: (r) => r.qty }, kitchen, couriers) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, kitchen, couriers],
  );

  const rowText = (r: Row, label: string) => {
    const due = cashDue(r);
    return [
      `${label}) ${r.orders.address}${r.orders.hotel ? ` (${r.orders.hotel})` : ''}`,
      `   Telegram: ${tgLabel(r.orders.telegram)}`,
      ...(r.orders.phone ? [`   Тел.: ${formatPhone(r.orders.phone)}`] : []),
      ...(r.orders.type === 'subscription' ? [`   ${subLabel(r.orders.order_days.length)}, день ${dayNo(r)} из ${r.orders.order_days.length}`] : []),
      `   ПОРЦИЙ: ${r.qty}`,
      ...(r.orders.cutlery ? ['   ПРИБОРЫ: ДА'] : []),
      `   ${due ? `Взять наличными: ${fmtMoney(due)}` : 'Оплачено'}`,
      ...(r.orders.comment ? [`   Комментарий: ${r.orders.comment}`] : []),
      '',
    ];
  };

  /** Текст маршрута для отправки курьеру: остановки по порядку + ссылки Google Maps. */
  const routeText = (r: Route<Row>, title: string) => {
    const items = r.stops.flatMap((st) => st.items);
    const lines = [`${title} на ${labelFull(date, 'ru')} — ${r.stops.length} адр., ${sum(items)} порц., приборов: ${cutleryCount(items)}, ${km(r.km)}`, ''];
    r.stops.forEach((st, si) => st.items.forEach((row, k) => lines.push(...rowText(row, st.items.length > 1 ? `${si + 1}.${k + 1}` : String(si + 1)))));
    r.links.forEach((u, i) => lines.push(`Маршрут${r.links.length > 1 ? ` ${i + 1}/${r.links.length}` : ''}: ${u}`));
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
        body: JSON.stringify({ date, parts: 'kitchen' }),
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

  const DeliveryCard = ({ r, label, onSaved }: { r: Row; label: string; onSaved?: () => void }) => {
    const due = cashDue(r);
    const href = tgHref(r.orders.telegram);
    return (
      <Card className={r.delivered ? 'bg-success-bg2 opacity-80' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2.5">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-white">{label}</div>
            <div className="flex min-w-0 flex-col gap-0.5">
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
            <div className={`text-sm font-bold ${due ? 'text-accent' : 'text-success'}`}>{due ? `к получению: ${fmtMoney(due)}` : 'оплачено'}</div>
          </div>
        </div>
        {r.orders.lat == null && onSaved && <PinPoint orderId={r.orders.id} onSaved={onSaved} />}
        <Btn kind={r.delivered ? 'ghost' : 'primary'} className="mt-3 w-full" onClick={() => toggle(r)}>
          {r.delivered ? '✓ Доставлено (отменить)' : 'Доставлено'}
        </Btn>
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
      <Err>{error}</Err>
      {notice && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{notice}</div>}

      {rows && (
        <Card className="flex flex-col gap-1">
          <div className="text-[17px] font-extrabold">
            {sum(confirmed)} порций <span className="text-sm font-bold text-ink-muted">· подтверждено, {confirmed.length} адр. · приборов: {cutleryCount(confirmed)}</span>
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
      {plan?.routes.map((route, ri) => {
        const items = route.stops.flatMap((st) => st.items);
        const key = `r${ri}`;
        const long = couriers === 1 && route.km > LONG_ROUTE_KM;
        return (
          <section key={key} className="flex flex-col gap-3">
            <div className="rounded-md2 border border-line bg-sand/50 px-4 py-3">
              <div className="text-[17px] font-extrabold">{couriers === 2 ? `🛵 Курьер ${ri + 1}` : '🛵 Маршрут'}</div>
              <div className="text-sm text-ink-2">
                {route.stops.length} адр. · {sum(items)} порц. · приборов: {cutleryCount(items)} · {km(route.km)}
              </div>
              {long && <div className="mt-1 text-sm font-extrabold text-danger">⚠️ длинный маршрут, подумай о 2 курьерах</div>}
            </div>
            {route.stops.map((st, si) => st.items.map((r, k) => <DeliveryCard key={r.id} r={r} label={st.items.length > 1 ? `${si + 1}.${k + 1}` : String(si + 1)} />))}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {route.links.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="flex min-h-11 flex-1 items-center justify-center rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent hover:bg-accent-soft/60 hover:no-underline">
                    🗺 Открыть маршрут{route.links.length > 1 ? ` ${i + 1}/${route.links.length}` : ''}
                  </a>
                ))}
              </div>
              <Btn kind="outline" onClick={() => copyText(key, routeText(route, couriers === 2 ? `Курьер ${ri + 1}` : 'Доставка'))}>
                {copied === key ? 'Скопировано ✓' : 'Скопировать список'}
              </Btn>
            </div>
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

      <Btn kind="outline" className="lg:col-start-2 lg:row-start-2 lg:!px-3 lg:!text-sm" onClick={sendReport} disabled={sending}>
        {sending ? 'Отправляем…' : `Отправить отчёт в Telegram (курьеров: ${couriers})`}
      </Btn>
      <Btn kind="outline" className="lg:col-start-2 lg:row-start-3 lg:!px-3 lg:!text-sm" onClick={sendKitchen} disabled={sendingKitchen}>
        {sendingKitchen ? 'Отправляем…' : 'Отправить порции повару'}
      </Btn>
    </div>
  );
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'ПОРЦИЯ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'ПОРЦИИ' : 'ПОРЦИЙ');
const km = (n: number) => `≈ ${(Math.round(n * 10) / 10).toString().replace('.', ',')} км`;
