'use client';

import { useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { Btn, Card, Err, Label, inputCls } from './ui';

const FIELDS = [
  { key: 'price_single', label: 'Цена обеда, ₫', numeric: true },
  { key: 'price_subscription', label: 'Цена подписки (5 дней), ₫', numeric: true },
  { key: 'delivery_fee', label: 'Доставка, ₫ (пока не учитывается в сумме)', numeric: true },
  { key: 'telegram_url', label: 'Ссылка Telegram для заказов на сегодня', numeric: false },
] as const;

export function SettingsTab() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminDb.from('settings').select('key, value').then(({ data, error }) => {
      if (error) setError(error.message);
      else setValues(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
    });
  }, []);

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
    if (error) setError(error.message);
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
    </div>
  );
}
