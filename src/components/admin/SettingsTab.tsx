'use client';

import { useEffect, useState } from 'react';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { AddressInput } from './AddressEditor';
import { DiscountCard } from './DiscountCard';
import { KitchenNotesCard } from './KitchenNotesCard';
import { VipCard } from './VipCard';
import type { PlaceInfo } from '@/lib/places';
import { Btn, Card, Err, Label, inputCls } from './ui';
import { useReadOnly } from './role';

const KITCHEN = [
  { key: 'kitchen_address', label: 'Адрес кухни (старт маршрута курьера)' },
  { key: 'kitchen_lat', label: 'Широта кухни' },
  { key: 'kitchen_lng', label: 'Долгота кухни' },
] as const;
/** Telegram user id курьера и админов, которым разрешена кнопка «Доставлено» в группе курьера (через запятую; свой id можно узнать у @userinfobot). */
const COURIER_IDS_KEY = 'courier_tg_ids';

const TRIPS = [
  { key: 'trip_capacity', label: 'Порций за рейс (обычные рейсы и последний «с ящиком»)', kind: 'int', min: 1, max: 50 },
  { key: 'trip_nobox_portions', label: 'Без ящика, порций (последний рейс в район FPT, если порций там не больше порога)', kind: 'int', min: 1, max: 50 },
  { key: 'trip_box_threshold', label: 'Порог для ящика: порций в районе FPT больше этого — рейс с ящиком', kind: 'int', min: 0, max: 50 },
  { key: 'courier_speed_kmh', label: 'Средняя скорость, км/ч', kind: 'num', min: 5, max: 80 },
  { key: 'stop_minutes', label: 'Время на точку, мин', kind: 'num', min: 0, max: 30 },
  { key: 'road_factor', label: 'Коэффициент дорог к прямой (по умолчанию 1,3)', kind: 'num', min: 1, max: 3 },
  { key: 'depart_time', label: 'Выезд с кухни (ЧЧ:ММ)', kind: 'time' },
  { key: 'deadline_time', label: 'Конец окна доставки (ЧЧ:ММ)', kind: 'time' },
  { key: 'trip_gap_min', label: 'Пауза между рейсами (перезагрузка на кухне), мин', kind: 'num', min: 0, max: 120 },
] as const;

const PAY = [
  { key: 'courier_pay_per_address', label: 'Оплата за адрес, ₫', kind: 'int', min: 0, max: 1000000 },
  { key: 'courier_fuel_l100', label: 'Расход бензина, л/100 км', kind: 'num', min: 0, max: 50 },
  { key: 'courier_fuel_price', label: 'Цена бензина, ₫/л (меняется вручную)', kind: 'int', min: 0, max: 200000 },
  { key: 'courier_lunch', label: 'Обед курьера, ₫/день (вычитается из ЗП за каждый рабочий день; 0 — не вычитать)', kind: 'int', min: 0, max: 1000000 },
] as const;
const PAY_DEFAULTS: Record<string, string> = { courier_lunch: '50000', courier_lunch_from: '2026-11-05', extra_portions: '2', courier_pay_from: '2026-11-02', courier_pay_per_address: '20000', courier_fuel_l100: '2.2', courier_fuel_price: '26000' };
const TRIP_DEFAULTS: Record<string, string> = { trip_capacity: '18', trip_nobox_portions: '3', trip_box_threshold: '3', courier_speed_kmh: '25', stop_minutes: '4', road_factor: '1.3', depart_time: '13:00', deadline_time: '16:00', trip_gap_min: '10' };

const FIELDS = [
  { key: 'price_single', label: 'Цена обеда, ₫', numeric: true, time: false },
  { key: 'price_subscription', label: 'Цена подписки за 5 дней, ₫ (обед в подписке = 1/5)', numeric: true, time: false },
  { key: 'delivery_single', label: 'Доставка, ₫ за каждый день доставки (разовый и подписка)', numeric: true, time: false },
  { key: 'delivery_from', label: 'Доставка с (ЧЧ:ММ; сайт и сообщение о заказе)', numeric: false, time: true },
  { key: 'delivery_to', label: 'Доставка до (ЧЧ:ММ)', numeric: false, time: true },
  { key: 'renewal_followup_days', label: 'Повторное «Голодны?» через, дней (после первого напоминания; 1–30)', numeric: true, time: false },
  { key: 'telegram_url', label: 'Ссылка Telegram для заказов на сегодня', numeric: false, time: false },
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
      else setValues({ renewal_followup_days: '7', ...Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) });
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
    const ids = (values[COURIER_IDS_KEY] ?? '').split(/[\s,;]+/).filter(Boolean);
    if (ids.some((x) => !/^\d{5,15}$/.test(x))) return setError('Проверьте «Курьер: Telegram id» — только цифры, через запятую.');
    setBusy(true);
    const rows = [
      ...KITCHEN.map((f) => ({ key: f.key, value: values[f.key].trim(), is_public: false })),
      { key: 'couriers_count', value: values.couriers_count === '2' ? '2' : '1', is_public: false },
      { key: COURIER_IDS_KEY, value: ids.join(','), is_public: false },
      { key: 'extra_portions', value: String(Math.min(50, Number((values.extra_portions ?? '2') || 0))), is_public: false },
    ];
    const { error } = await adminDb.from('settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) setError(ruError(error.message));
    else setMsg('Курьеры сохранены. Следующий ночной отчёт будет по этим настройкам.');
  };

  const savePay = async () => {
    if (!values) return;
    setError('');
    setMsg('');
    const rows: { key: string; value: string; is_public: boolean }[] = [];
    for (const f of PAY) {
      const v = (values[f.key] ?? PAY_DEFAULTS[f.key]).trim().replace(',', '.');
      const n = Number(v);
      if (v === '' || !Number.isFinite(n) || n < f.min || n > f.max || (f.kind === 'int' && !Number.isInteger(n))) return setError(`Проверьте поле: ${f.label}`);
      rows.push({ key: f.key, value: v, is_public: false });
    }
    const from = (values.courier_pay_from ?? PAY_DEFAULTS.courier_pay_from).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(from))) return setError('Проверьте поле: Учитывать ЗП с даты');
    rows.push({ key: 'courier_pay_from', value: from, is_public: false });
    const lunchFrom = (values.courier_lunch_from ?? PAY_DEFAULTS.courier_lunch_from).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lunchFrom) || Number.isNaN(Date.parse(lunchFrom))) return setError('Проверьте поле: Вычитать обед с даты');
    rows.push({ key: 'courier_lunch_from', value: lunchFrom, is_public: false });
    setBusy(true);
    const { error } = await adminDb.from('settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) setError(ruError(error.message));
    else setMsg('Параметры ЗП курьера сохранены. Применятся к расчёту (уже выплаченные дни не меняются).');
  };

  /** «Финиш курьера»: адрес из подсказок Google (координаты берутся из выбранного места) или очистка (тогда последний рейс открытый, как раньше). */
  const saveFinish = async (clear: boolean) => {
    if (!values) return;
    setError('');
    setMsg('');
    const lat = clear ? '' : (values.courier_finish_lat ?? '').trim();
    const lng = clear ? '' : (values.courier_finish_lng ?? '').trim();
    if (!clear && (!(values.courier_finish_address ?? '').trim() || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Number(lat) < 15.9 || Number(lat) > 16.2 || Number(lng) < 107.9 || Number(lng) > 108.5 || !lat || !lng)) {
      return setError('Выберите адрес финиша из подсказок (должен быть в Дананге).');
    }
    const radius = (values.courier_finish_radius_km ?? '3').trim().replace(',', '.');
    if (!clear && (radius === '' || !Number.isFinite(Number(radius)) || Number(radius) < 0.1 || Number(radius) > 30)) return setError('Проверьте поле: Радиус вокруг финиша, км (0,1–30).');
    setBusy(true);
    const rows = [
      ...(clear ? [] : [{ key: 'courier_finish_radius_km', value: radius, is_public: false }]),
      { key: 'courier_finish_address', value: clear ? '' : values.courier_finish_address.trim(), is_public: false },
      { key: 'courier_finish_lat', value: lat, is_public: false },
      { key: 'courier_finish_lng', value: lng, is_public: false },
    ];
    const { error } = await adminDb.from('settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) return setError(ruError(error.message));
    if (clear) setValues({ ...values, courier_finish_address: '', courier_finish_lat: '', courier_finish_lng: '' });
    setMsg(clear ? 'Финиш убран: последний рейс заканчивается на последней точке.' : 'Финиш сохранён. Со следующего отчёта последний рейс заканчивается здесь.');
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
      if (f.numeric ? !/^\d+$/.test(v) : f.time ? !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v) : !/^https?:\/\//.test(v)) {
        return setError(`Проверьте поле: ${f.label}`);
      }
    }
    if (Number(values.renewal_followup_days) < 1 || Number(values.renewal_followup_days) > 30) return setError('«Повторное через, дней» — от 1 до 30.');
    const mins = (k: string) => {
      const [h, m] = values[k].trim().split(':');
      return +h * 60 + +m;
    };
    if (mins('delivery_from') >= mins('delivery_to')) return setError('«Доставка с» должна быть раньше «Доставка до».');
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
          {row('Курьер: Telegram id', values[COURIER_IDS_KEY] || '—')}
          {row('Доп. порции в день (кухня)', values.extra_portions ?? '2')}
        </Card>
        <Card className="divide-y divide-line">
          <div className="pb-2 text-[17px] font-extrabold">Финиш курьера</div>
          {row('Адрес финиша (дом курьера)', values.courier_finish_address || '—')}
          {row('Радиус вокруг финиша, км', values.courier_finish_radius_km ?? '3')}
        </Card>
        <Card className="divide-y divide-line">
          <div className="pb-2 text-[17px] font-extrabold">ЗП курьера</div>
          {PAY.map((f) => row(f.label, values[f.key] ?? PAY_DEFAULTS[f.key]))}
          {row('Вычитать обед с даты', values.courier_lunch_from ?? PAY_DEFAULTS.courier_lunch_from)}
        </Card>
        <Card className="divide-y divide-line">
          <div className="pb-2 text-[17px] font-extrabold">Рейсы курьера</div>
          {TRIPS.map((f) => row(f.label, values[f.key] ?? TRIP_DEFAULTS[f.key]))}
        </Card>
        <KitchenNotesCard />
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
              inputMode={f.numeric ? 'numeric' : f.time ? 'text' : 'url'}
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
          <Label>Доп. порции в день (отчёт кухне: заказанные + эти порции)</Label>
          <input className={inputCls} inputMode="numeric" value={values.extra_portions ?? PAY_DEFAULTS.extra_portions} onChange={(e) => setValues({ ...values, extra_portions: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div>
          <Label>Курьер: Telegram id (кнопка «Доставлено» в группе курьера; несколько — через запятую; админы из ADMIN_TG_IDS тоже могут)</Label>
          <input className={inputCls} inputMode="numeric" placeholder="например 524375262" value={values[COURIER_IDS_KEY] ?? ''} onChange={(e) => setValues({ ...values, [COURIER_IDS_KEY]: e.target.value })} />
        </div>
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
        <div className="text-[17px] font-extrabold">Финиш курьера</div>
        <div>
          <Label>Адрес финиша (дом курьера; последний рейс дня заканчивается здесь; при 2 курьерах — у первого)</Label>
          <AddressInput
            value={values.courier_finish_address ?? ''}
            onText={(v) => setValues({ ...values, courier_finish_address: v, courier_finish_lat: '', courier_finish_lng: '' })}
            onPlace={(p: PlaceInfo) => setValues({ ...values, courier_finish_address: p.text, courier_finish_lat: String(p.lat), courier_finish_lng: String(p.lng) })}
          />
          <div className="mt-1 text-xs text-ink-muted">
            {values.courier_finish_lat && values.courier_finish_lng ? `Точка: ${values.courier_finish_lat}, ${values.courier_finish_lng}` : 'Выберите адрес из подсказок — без выбора точка не определяется.'}
          </div>
        </div>
        <div>
          <Label>Радиус вокруг финиша, км (точки внутри него — всегда отдельный последний рейс до дома)</Label>
          <input className={inputCls} inputMode="decimal" value={values.courier_finish_radius_km ?? '3'} onChange={(e) => setValues({ ...values, courier_finish_radius_km: e.target.value })} />
        </div>
        {values.courier_finish_lat && values.courier_finish_lng && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${values.courier_finish_lat},${values.courier_finish_lng}`} target="_blank" rel="noreferrer" className="text-sm font-bold">
            Проверить точку на карте →
          </a>
        )}
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => void saveFinish(false)} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить финиш'}</Btn>
          <Btn kind="ghost" onClick={() => void saveFinish(true)} disabled={busy}>Убрать</Btn>
        </div>
        <div className="text-xs text-ink-muted">Бензин в ЗП считается до последнего заказа; отрезок «последний заказ → дом» в ЗП не входит. Нет финиша — последний рейс открытый, как раньше.</div>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="text-[17px] font-extrabold">ЗП курьера</div>
        {PAY.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <input className={inputCls} inputMode="decimal" value={values[f.key] ?? PAY_DEFAULTS[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </div>
        ))}
        <div>
          <Label>Учитывать ЗП с даты</Label>
          <input className={inputCls} type="date" value={values.courier_pay_from ?? PAY_DEFAULTS.courier_pay_from} onChange={(e) => setValues({ ...values, courier_pay_from: e.target.value })} />
        </div>
        <div>
          <Label>Вычитать обед с даты</Label>
          <input className={inputCls} type="date" value={values.courier_lunch_from ?? PAY_DEFAULTS.courier_lunch_from} onChange={(e) => setValues({ ...values, courier_lunch_from: e.target.value })} />
        </div>
        <div className="text-xs text-ink-muted">Дни раньше этой даты не входят ни в расчёт, ни в еженедельный отчёт. ЗП = адреса × оплата за адрес + бензин (км × расход / 100 × цена, округлено до 500 ₫). Адрес = клиент в точке доставки.</div>
        <Btn onClick={savePay} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить ЗП курьера'}</Btn>
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
      <KitchenNotesCard />
      <VipCard />
      <DiscountCard />
    </div>
  );
}
