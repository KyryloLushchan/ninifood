'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { Btn, Card, Err, Label, inputCls } from './ui';

const LANGS = [['ru', 'Русский'], ['ua', 'Українська'], ['en', 'English'], ['vi', 'Tiếng Việt']] as const;
const POSITIONS = ['Суп', 'Салат', 'Горячее', 'Десерт'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const NUTRITION = [['kcal', 'Ккал'], ['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']] as const;

type Dish = Record<string, string>; // name_ru…, desc_ru…, photo_url, weight_label, kcal…
const emptyDish = (): Dish => ({
  photo_url: '',
  weight_label: '',
  ...Object.fromEntries(NUTRITION.map(([k]) => [k, ''])),
  ...Object.fromEntries(LANGS.flatMap(([l]) => [[`name_${l}`, ''], [`desc_${l}`, '']])),
});
const emptyForm = () => POSITIONS.map(emptyDish);

async function loadDay(weekday: number): Promise<Dish[]> {
  const { data, error } = await adminDb.from('menu_dishes').select('*').eq('weekday', weekday);
  if (error) throw new Error(error.message);
  const form = emptyForm();
  for (const r of data ?? []) {
    const d = form[r.position - 1];
    if (!d) continue;
    for (const k of Object.keys(d)) d[k] = r[k] == null ? '' : String(r[k]);
  }
  return form;
}

const toInt = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function MenuTab() {
  const [weekday, setWeekday] = useState(1);
  const [form, setForm] = useState<Dish[]>(emptyForm);
  const [incomplete, setIncomplete] = useState<number[] | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Предупреждение по шаблону: дни Пн–Сб, где меньше 4 блюд.
  const checkIncomplete = useCallback(async () => {
    const { data } = await adminDb.from('menu_dishes').select('weekday');
    const cnt: Record<number, number> = {};
    (data ?? []).forEach((r) => (cnt[r.weekday] = (cnt[r.weekday] ?? 0) + 1));
    setIncomplete([1, 2, 3, 4, 5, 6].filter((d) => (cnt[d] ?? 0) < 4));
  }, []);

  useEffect(() => {
    checkIncomplete();
  }, [checkIncomplete]);

  useEffect(() => {
    setMsg('');
    setError('');
    loadDay(weekday).then(setForm).catch((e) => setError(e.message));
  }, [weekday]);

  const set = (i: number, k: string, v: string) => setForm((f) => f.map((d, j) => (j === i ? { ...d, [k]: v } : d)));

  const save = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const upsert: Record<string, unknown>[] = [];
      const remove: number[] = [];
      form.forEach((d, i) => {
        const any = LANGS.some(([l]) => d[`name_${l}`].trim());
        if (!any) return remove.push(i + 1);
        const fallback = LANGS.map(([l]) => d[`name_${l}`].trim()).find(Boolean)!;
        const row: Record<string, unknown> = {
          weekday,
          position: i + 1,
          photo_url: d.photo_url.trim() || null,
          weight_label: d.weight_label.trim() || null,
        };
        for (const [k] of NUTRITION) row[k] = toInt(d[k]);
        for (const [l] of LANGS) {
          row[`name_${l}`] = d[`name_${l}`].trim() || d.name_ru.trim() || fallback; // пустой язык → русское название
          row[`desc_${l}`] = d[`desc_${l}`].trim() || null;
        }
        upsert.push(row);
      });
      if (upsert.length) {
        const { error } = await adminDb.from('menu_dishes').upsert(upsert, { onConflict: 'weekday,position' });
        if (error) throw new Error(error.message);
      }
      if (remove.length) {
        const { error } = await adminDb.from('menu_dishes').delete().eq('weekday', weekday).in('position', remove);
        if (error) throw new Error(error.message);
      }
      setMsg(`Сохранено: ${upsert.length} из 4 блюд`);
      checkIncomplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {incomplete && incomplete.length > 0 && (
        <div className="rounded-md2 bg-accent-soft px-4 py-3 text-sm">
          <b>В шаблоне меньше 4 блюд:</b>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {incomplete.map((d) => (
              <button key={d} onClick={() => setWeekday(d)} className="rounded-full bg-card px-2.5 py-1 font-bold text-accent">
                {WEEKDAYS[d - 1]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-ink-muted">Меню одинаковое каждую неделю: изменения сразу действуют на все такие дни недели.</div>
      <div className="grid grid-cols-6 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <button
            key={w}
            onClick={() => setWeekday(i + 1)}
            aria-pressed={weekday === i + 1}
            className={`rounded-chip border py-2 text-sm font-extrabold ${
              weekday === i + 1 ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink'
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      <Err>{error}</Err>
      {msg && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{msg}</div>}

      {form.map((d, i) => (
        <Card key={i} className="flex flex-col gap-2.5">
          <div className="text-[13px] font-extrabold uppercase tracking-[.04em] text-accent">{POSITIONS[i]}</div>
          {LANGS.map(([l, label]) => (
            <div key={l}>
              <Label>Название · {label}</Label>
              <input className={inputCls} value={d[`name_${l}`]} onChange={(e) => set(i, `name_${l}`, e.target.value)} />
              <input className={`${inputCls} mt-1.5`} placeholder="Описание (необязательно)" value={d[`desc_${l}`]} onChange={(e) => set(i, `desc_${l}`, e.target.value)} />
            </div>
          ))}
          <div>
            <Label>Вес</Label>
            <input className={inputCls} placeholder="450 · 150+ (мясо + гарнир) · 2pc" value={d.weight_label} onChange={(e) => set(i, 'weight_label', e.target.value)} />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {NUTRITION.map(([k, label]) => (
              <div key={k}>
                <Label>{label}</Label>
                <input className={inputCls} inputMode="numeric" value={d[k]} onChange={(e) => set(i, k, e.target.value.replace(/\D/g, ''))} />
              </div>
            ))}
          </div>
          <div>
            <Label>Фото (путь или URL)</Label>
            <input className={inputCls} placeholder="/photos/borsch-800.webp" value={d.photo_url} onChange={(e) => set(i, 'photo_url', e.target.value)} />
          </div>
        </Card>
      ))}
      <div className="text-xs text-ink-muted">
        Пустое название = блюда нет. Если язык не заполнен, на нём покажется русское название. КБЖУ — на порцию, примерные.
      </div>
      <Btn onClick={save} disabled={busy} className="sticky bottom-20">{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
    </div>
  );
}
