'use client';

import { useEffect, useState } from 'react';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { DiscountCard } from './DiscountCard';
import { VipCard } from './VipCard';
import { Btn, Card, Err, Label, inputCls } from './ui';

const KITCHEN = [
  { key: 'kitchen_address', label: 'Адрес кухни (старт маршрута курьера)' },
  { key: 'kitchen_lat', label: 'Широта кухни' },
  { key: 'kitchen_lng', label: 'Долгота кухни' },
] as const;

const FIELDS = [
  { key: 'price_single', label: 'Цена обеда, ₫', numeric: true },
  { key: 'price_subscription', label: 'Цена подписки за 5 дней, ₫ (обед в подписке = 1/5)', numeric: true },
  { key: 'delivery_single', label: 'Доставка, ₫ за каждый день доставки (разовый и подписка)', numeric: true },
  { key: 'telegram_url', label: 'Ссылка Telegram для заказов на сегодня', numeric: false },
] as const;

export function SettingsTab() {
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

  return (
    <div className="flex flex-col gap-3">
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
      <VipCard />
      <DiscountCard />
    </div>
  );
}
