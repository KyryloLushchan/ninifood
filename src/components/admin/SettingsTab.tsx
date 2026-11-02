'use client';

import { useEffect, useState } from 'react';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { DiscountCard } from './DiscountCard';
import { VipCard } from './VipCard';
import { Btn, Card, Err, Label, inputCls } from './ui';
import { useReadOnly } from './role';

const KITCHEN = [
  { key: 'kitchen_address', label: 'Адрес кухни (старт маршрута курьера)' },
  { key: 'kitchen_lat', label: 'Широта кухни' },
  { key: 'kitchen_lng', label: 'Долгота кухни' },
] as const;

const TRIPS = [
  { key: 'trip_capacity', label: 'Порций за рейс', kind: 'int', min: 1, max: 50 },
  { key: 'courier_speed_kmh', label: 'Средняя скорость, км/ч', kind: 'num', min: 5, max: 80 },
  { key: 'stop_minutes', label: 'Время на точку, мин', kind: 'num', min: 0, max: 30 },
  { key: 'road_factor', label: 'Коэффициент дорог к прямой (по умолчанию 1,3)', kind: 'num', min: 1, max: 3 },
  { key: 'depart_time', label: 'Выезд с кухни (ЧЧ:ММ)', kind: 'time' },
  { key: 'deadline_time', label: 'Конец окна доставки (ЧЧ:ММ)', kind: 'time' },
  { key: 'trip_gap_min', label: 'Пауза между рейсами (перезагрузка на кухне), мин', kind: 'num', min: 0, max: 120 },
] as const;
const TRIP_DEFAULTS: Record<string, string> = { trip_capacity: '9', courier_speed_kmh: '25', stop_minutes: '4', road_factor: '1.3', depart_time: '13:00', deadline_time: '16:00', trip_gap_min: '10' };

const FIELDS = [
  { key: 'price_single', label: 'Цена обеда, ₫', numeric: true },
  { key: 'price_subscription', label: 'Цена подписки за 5 дней, ₫ (обед в подписке = 1/5)', numeric: true },
  { key: 'delivery_single', label: 'Доставка, ₫ за каждый день доставки (разовый и подписка)', numeric: true },
  { key: 'telegram_url', label: 'Ссылка Telegram для заказов на сегодня', numeric: false },
] as const;

export function SettingsTab() {
  const readOnly = useReadOnly();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminDb.from('settings').select('key, value').then(({ data, error }) => {
      if (error) setError(ruError(error.message));
      else setValues(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
    });
  }, []);

  const saveCouriers = async () => {
    if (!values) return;
    setError('');
    setMsg('');
    const lat = Number(values.kitchen_lat);
    const lng = Number(values.kitchen_lng);
    if (!(values.kitchen_address ?? '').trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 15.9 || lat > 16.2 || lng < 107.9 || lng > 108.5) {
      return setError('Проверьте адрес и координаты кухни (должны быть в Дананге).');
    }
    setBusy(true);
    const rows = [
      ...KITCHEN.map((f) => ({ key: f.key, value: values[f.key].trim(), is_public: false })),
      { key: 'couriers_count', value: values.couriers_count === '2' ? '2' : '1', is_public: false },
    ];
    const { error } = await adminDb.from('settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) setError(ruError(error.message));
    else setMsg('Курьеры сохранены. Следующий ночной отчёт будет по этим настройкам.');
  };

  const saveTrips = async () => {
    if (!values) return;
    setError('');
    setMsg('');
    const rows: { key: string; value: string; is_public: boolean }[] = [];
    for (const f of TRIPS) {
      const v = (values[f.key] ?? TRIP_DEFAULTS[f.key]).trim().replace(',', '.');
      const bad =
        f.kind === 'time'
          ? !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)
          : !(v !== '' && Number.isFinite(Number(v)) && Number(v) >= f.min && Number(v) <= f.max && (f.kind !== 'int' || Number.isInteger(Number(v))));
      if (bad) return setError(`Проверьте поле: ${f.label}`);
      rows.push({ key: f.key, value: v, is_public: false });
    }
    const toMin = (k: string) => {
      const [h, m] = rows.find((r) => r.key === k)!.value.split(':');
      return +h * 60 + +m;
    };
    if (toMin('depart_time') >= toMin('deadline_time')) return setError('Выезд должен быть раньше конца окна.');
    setBusy(true);
    const { error } = await adminDb.from('settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) setError(ruError(error.message));
    else setMsg('Параметры рейсов сохранены. Отчёт курьеру и вкладка «Курьер» будут считаться по ним.');
  };

  const save = async () => {
    if (!values) return;
    setError('');
    setMsg('');
    for (const f of FIELDS) {
      const v = (values[f.key] ?? '').trim();
      if (f.numeric ? !/^\d+$/.test(v) : !/^https?:\/\//.test(v)) {
        return setError(`Проверьте поле: ${f.label}`);
      }
    }
    setBusy(true);
    const rows = FIELDS.map((f) => ({ key: f.key, value: values[f.key].trim(), is_public: true }));
    const { error } = await adminDb.from('settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) setError(ruError(error.message));
    else setMsg('Сохранено. Сайт подхватит новые значения при следующей загрузке, сумму заказа сервер считает по ним сразу.');
  };

  if (!values) return <div className="py-6 text-center text-sm text-ink-muted">{error || 'Загрузка…'}</div>;

  if (readOnly) {
    const row = (label: string, v: string | undefined) => (
      <div key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
        <span className="text-ink-2">{label}</span>
        <b className="text-right">{v || '—'}</b>
      </div>
    );
    return (
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <Card className="divide-y divide-line">{FIELDS.map((f) => row(f.label, values[f.key]))}</Card>
        <Card className="divide-y divide-line">
          <div className="pb-2 text-[17px] font-extrabold">Курьеры</div>
          {KITCHEN.map((f) => row(f.label, values[f.key]))}
          {row('Курьеров по умолчанию', values.couriers_count)}
        </Card>
        <Card className="divide-y divide-line">
          <div className="pb-2 text-[17px] font-extrabold">Рейсы курьера</div>
          {TRIPS.map((f) => row(f.label, values[f.key] ?? TRIP_DEFAULTS[f.key]))}
        </Card>
        <VipCard />
        <DiscountCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="contents lg:flex lg:flex-col lg:gap-3">
      <Card className="flex flex-col gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <input
              className={inputCls}
              inputMode={f.numeric ? 'numeric' : 'url'}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </Card>
      <Err>{error}</Err>
      {msg && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{msg}</div>}
      <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
      </div>
      <Card className="flex flex-col gap-3">
        <div className="text-[17px] font-extrabold">Курьеры</div>
        {KITCHEN.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <input className={inputCls} inputMode={f.key === 'kitchen_address' ? 'text' : 'decimal'} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </div>
        ))}
        {/^-?\d+(\.\d+)?$/.test((values.kitchen_lat ?? '').trim()) && /^-?\d+(\.\d+)?$/.test((values.kitchen_lng ?? '').trim()) && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${values.kitchen_lat.trim()},${values.kitchen_lng.trim()}`} target="_blank" rel="noreferrer" className="text-sm font-bold">
            Проверить точку на карте →
          </a>
        )}
        <div>
          <Label>Курьеров по умолчанию (для отчёта в 00:00; на конкретный день — переключатель во вкладке «Курьер»)</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['1', '2'] as const).map((n) => (
              <Btn key={n} kind={(values.couriers_count ?? '1') === n ? 'primary' : 'ghost'} onClick={() => setValues({ ...values, couriers_count: n })}>
                {n}
              </Btn>
            ))}
          </div>
        </div>
        <Btn onClick={saveCouriers} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить курьеров'}</Btn>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="text-[17px] font-extrabold">Рейсы курьера</div>
        {TRIPS.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <input className={inputCls} inputMode={f.kind === 'time' ? 'text' : 'decimal'} value={values[f.key] ?? TRIP_DEFAULTS[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </div>
        ))}
        <div className="text-xs text-ink-muted">Расстояние — по прямой × коэффициент, платных карт нет. Рейс — это порции за один выезд; промежуточные рейсы возвращаются на кухню, последний — нет.</div>
        <Btn onClick={saveTrips} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить рейсы'}</Btn>
      </Card>
      <VipCard />
      <DiscountCard />
    </div>
  );
}
