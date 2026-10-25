'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, isSunday, labelFull, todayISO } from '@/lib/dates';
import { adminDb } from '@/lib/admin/client';
import { Btn, Card, Err, Label, inputCls } from './ui';

const LANGS = [['ru', 'Русский'], ['ua', 'Українська'], ['en', 'English'], ['vi', 'Tiếng Việt']] as const;
const POSITIONS = ['Суп', 'Салат', 'Горячее', 'Десерт'];

type Dish = Record<string, string>; // name_ru…, desc_ru…, photo_url
const emptyDish = (): Dish => ({ photo_url: '', ...Object.fromEntries(LANGS.flatMap(([l]) => [[`name_${l}`, ''], [`desc_${l}`, '']])) });
const emptyForm = () => POSITIONS.map(emptyDish);

async function loadDay(date: string): Promise<Dish[]> {
  const { data, error } = await adminDb.from('menu_dishes').select('*').eq('date', date);
  if (error) throw new Error(error.message);
  const form = emptyForm();
  for (const r of data ?? []) {
    const d = form[r.position - 1];
    if (!d) continue;
    for (const k of Object.keys(d)) d[k] = r[k] ?? '';
  }
  return form;
}

export function MenuTab() {
  const [date, setDate] = useState(() => addDays(todayISO(), 1));
  const [form, setForm] = useState<Dish[]>(emptyForm);
  const [copyFrom, setCopyFrom] = useState('');
  const [missing, setMissing] = useState<string[] | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checkMissing = useCallback(async () => {
    const t = todayISO();
    const days = Array.from({ length: 7 }, (_, i) => addDays(t, i + 1)).filter((d) => !isSunday(d));
    const { data } = await adminDb.from('menu_dishes').select('date').in('date', days);
    const cnt: Record<string, number> = {};
    (data ?? []).forEach((r) => (cnt[r.date] = (cnt[r.date] ?? 0) + 1));
    setMissing(days.filter((d) => (cnt[d] ?? 0) < 4));
  }, []);

  useEffect(() => {
    checkMissing();
  }, [checkMissing]);

  useEffect(() => {
    setMsg('');
    setError('');
    loadDay(date).then(setForm).catch((e) => setError(e.message));
  }, [date]);

  const set = (i: number, k: string, v: string) => setForm((f) => f.map((d, j) => (j === i ? { ...d, [k]: v } : d)));

  const copy = async () => {
    if (!copyFrom) return;
    try {
      setForm(await loadDay(copyFrom));
      setMsg(`Скопировано с ${labelFull(copyFrom, 'ru')} — проверьте и нажмите «Сохранить»`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

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
        const row: Record<string, unknown> = { date, position: i + 1, photo_url: d.photo_url.trim() || null };
        for (const [l] of LANGS) {
          row[`name_${l}`] = d[`name_${l}`].trim() || d.name_ru.trim() || fallback; // пустой язык → русское название
          row[`desc_${l}`] = d[`desc_${l}`].trim() || null;
        }
        upsert.push(row);
      });
      if (upsert.length) {
        const { error } = await adminDb.from('menu_dishes').upsert(upsert, { onConflict: 'date,position' });
        if (error) throw new Error(error.message);
      }
      if (remove.length) {
        const { error } = await adminDb.from('menu_dishes').delete().eq('date', date).in('position', remove);
        if (error) throw new Error(error.message);
      }
      setMsg(`Сохранено: ${upsert.length} из 4 блюд`);
      checkMissing();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {missing && missing.length > 0 && (
        <div className="rounded-md2 bg-accent-soft px-4 py-3 text-sm">
          <b>Нет полного меню на ближайшие 7 дней:</b>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {missing.map((d) => (
              <button key={d} onClick={() => setDate(d)} className="rounded-full bg-card px-2.5 py-1 font-bold text-accent">
                {labelFull(d, 'ru')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Btn kind="ghost" onClick={() => setDate(addDays(date, -1))}>←</Btn>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
        <Btn kind="ghost" onClick={() => setDate(addDays(date, 1))}>→</Btn>
      </div>
      <div className="text-center text-sm font-bold text-ink-2">{labelFull(date, 'ru')}</div>

      <Card>
        <Label>Скопировать меню с другой даты</Label>
        <div className="flex gap-2">
          <input type="date" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={inputCls} />
          <Btn kind="outline" onClick={copy} disabled={!copyFrom}>Копировать</Btn>
        </div>
      </Card>

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
            <Label>Фото (URL)</Label>
            <input className={inputCls} placeholder="https://…" value={d.photo_url} onChange={(e) => set(i, 'photo_url', e.target.value)} />
          </div>
        </Card>
      ))}
      <div className="text-xs text-ink-muted">Пустое название = блюда нет. Если язык не заполнен, на нём покажется русское название.</div>
      <Btn onClick={save} disabled={busy} className="sticky bottom-20">{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
    </div>
  );
}
