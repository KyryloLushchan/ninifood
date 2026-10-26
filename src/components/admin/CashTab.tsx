'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import type { CashCategory, CashMovement } from '@/lib/admin/money';
import { PRESETS, periodRange, type Preset } from '@/lib/admin/period';
import { Btn, Card, Err, Label, Note, inputCls } from './ui';

const TYPE_LABEL = { in: 'Приход', out: 'Расход' } as const;
type Type = keyof typeof TYPE_LABEL;

interface Form {
  type: Type;
  date: string;
  categoryId: string;
  amount: string;
  comment: string;
}
const emptyForm = (type: Type = 'out'): Form => ({ type, date: todayISO(), categoryId: '', amount: '', comment: '' });

export function CashTab() {
  const [preset, setPreset] = useState<Preset>('week');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [typeFilter, setTypeFilter] = useState<'' | Type>('');
  const [cats, setCats] = useState<CashCategory[]>([]);
  const [rows, setRows] = useState<CashMovement[] | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [a, b] = periodRange(preset, from, to);

  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);
  const formCats = cats.filter((c) => c.type === form.type && (c.is_active || String(c.id) === form.categoryId));

  useEffect(() => {
    adminDb
      .from('cash_categories')
      .select('*')
      .order('sort')
      .then(({ data, error }) => {
        if (error) setError(ruError(error.message));
        else setCats((data ?? []) as CashCategory[]);
      });
  }, []);

  const load = useCallback(async () => {
    let q = adminDb.from('cash_movements').select('id, date, type, category_id, amount, comment').gte('date', a).lte('date', b).order('date', { ascending: false }).order('id', { ascending: false });
    if (typeFilter) q = q.eq('type', typeFilter);
    const { data, error } = await q;
    if (error) setError(ruError(error.message));
    else setRows((data ?? []) as CashMovement[]);
  }, [a, b, typeFilter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const setType = (type: Type) => setForm((f) => ({ ...f, type, categoryId: '' }));

  const save = async () => {
    setError('');
    setMsg('');
    const amount = parseInt(form.amount, 10);
    if (!form.categoryId) return setError('Выберите категорию.');
    if (!(amount > 0)) return setError('Введите сумму больше нуля.');
    if (!form.date) return setError('Укажите дату.');
    setBusy(true);
    const row = { type: form.type, date: form.date, category_id: Number(form.categoryId), amount, comment: form.comment.trim() || null };
    const { error } = editId ? await adminDb.from('cash_movements').update(row).eq('id', editId) : await adminDb.from('cash_movements').insert(row);
    setBusy(false);
    if (error) return setError(ruError(error.message));
    setMsg(editId ? 'Запись изменена' : 'Запись добавлена');
    setEditId(null);
    setForm(emptyForm(form.type));
    load();
  };

  const startEdit = (r: CashMovement) => {
    setEditId(r.id);
    setForm({ type: r.type, date: r.date, categoryId: String(r.category_id), amount: String(r.amount), comment: r.comment ?? '' });
    setMsg('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: number) => {
    if (confirmDel !== id) return setConfirmDel(id);
    setConfirmDel(null);
    const { error } = await adminDb.from('cash_movements').delete().eq('id', id);
    if (error) setError(ruError(error.message));
    else {
      if (editId === id) {
        setEditId(null);
        setForm(emptyForm());
      }
      load();
    }
  };

  const sums = useMemo(() => {
    let i = 0;
    let o = 0;
    (rows ?? []).forEach((r) => (r.type === 'in' ? (i += r.amount) : (o += r.amount)));
    return { in: i, out: o };
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <div className="text-[15px] font-extrabold">{editId ? 'Изменить запись' : 'Новая запись'}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(TYPE_LABEL) as Type[]).map((t) => (
            <Btn key={t} kind={form.type === t ? 'primary' : 'ghost'} onClick={() => setType(t)} disabled={!!editId && form.type !== t}>
              {TYPE_LABEL[t]}
            </Btn>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Дата</Label>
            <input type="date" lang="ru" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label>Сумма, ₫</Label>
            <input className={inputCls} inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>
        <div>
          <Label>Категория</Label>
          <select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Выберите…</option>
            {formCats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Комментарий</Label>
          <input className={inputCls} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </div>
        <Err>{error}</Err>
        {msg && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{msg}</div>}
        <div className="flex gap-2">
          <Btn onClick={save} disabled={busy} className="flex-1">{busy ? 'Сохраняем…' : editId ? 'Сохранить' : 'Добавить'}</Btn>
          {editId && (
            <Btn kind="ghost" onClick={() => { setEditId(null); setForm(emptyForm()); }}>Отмена</Btn>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map(([id, label]) => (
          <Btn key={id} kind={preset === id ? 'primary' : 'ghost'} className="!px-1 !text-sm" onClick={() => setPreset(id)}>
            {label}
          </Btn>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" lang="ru" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} />
          <span>—</span>
          <input type="date" lang="ru" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {([['', 'Все'], ['in', 'Приход'], ['out', 'Расход']] as const).map(([v, label]) => (
          <Btn key={v} kind={typeFilter === v ? 'outline' : 'ghost'} className="!px-1 !text-sm" onClick={() => setTypeFilter(v)}>
            {label}
          </Btn>
        ))}
      </div>
      <Card className="flex justify-between text-sm">
        <div>Приход: <b className="text-success">{fmtMoney(sums.in)}</b></div>
        <div>Расход: <b className="text-danger">{fmtMoney(sums.out)}</b></div>
      </Card>

      {rows === null && <Note>Загрузка…</Note>}
      {rows?.length === 0 && <Note>Записей за период нет</Note>}
      {rows?.map((r) => (
        <Card key={r.id} className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-extrabold">{catName.get(r.category_id) ?? 'Без категории'}</div>
              <div className="text-xs text-ink-muted">{r.date.slice(8, 10)}.{r.date.slice(5, 7)}.{r.date.slice(0, 4)}{r.comment ? ` · ${r.comment}` : ''}</div>
            </div>
            <div className={`whitespace-nowrap font-serif text-[17px] font-bold ${r.type === 'in' ? 'text-success' : 'text-danger'}`}>
              {r.type === 'in' ? '+' : '−'}{fmtMoney(r.amount)}
            </div>
          </div>
          <div className="flex gap-2">
            <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={() => startEdit(r)}>Изменить</Btn>
            <Btn kind="danger" className="!min-h-9 !px-3 !text-sm" onClick={() => remove(r.id)}>
              {confirmDel === r.id ? 'Точно удалить?' : 'Удалить'}
            </Btn>
            {confirmDel === r.id && <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={() => setConfirmDel(null)}>Отмена</Btn>}
          </div>
        </Card>
      ))}
    </div>
  );
}
