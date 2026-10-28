'use client';

import { useEffect, useRef, useState } from 'react';
import { PLACES_DEBOUNCE_MS, PLACES_MIN_CHARS } from '@/config/google';
import { useI18n } from '@/i18n';
import { autocomplete, newSessionToken, placeDetails, type PlaceInfo, type Suggestion } from '@/lib/places';
import { Field } from './Field';

interface Props {
  label: string;
  placeholder: string;
  error?: string;
  value: string;
  place: PlaceInfo | null;
  /** Ручной ввод — координаты сбрасываются (их сбрасывает родитель, передавая place=null). */
  onText: (v: string) => void;
  onPlace: (p: PlaceInfo) => void;
}

/** Поле «Адрес» с подсказками Google Places. Любая ошибка API — обычное текстовое поле. */
export function AddressField({ label, placeholder, error, value, place, onText, onPlace }: Props) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const token = useRef(newSessionToken());
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const box = useRef<HTMLDivElement>(null);
  const typed = useRef(false); // подсказки — только на ввод пользователя, не на подставленный из профиля адрес

  const close = () => {
    clearTimeout(timer.current);
    abort.current?.abort();
    setOpen(false);
    setItems([]);
  };

  useEffect(() => {
    clearTimeout(timer.current);
    abort.current?.abort();
    const q = value.trim();
    // Текст выбранного места не ищем заново; короткий ввод — без запросов.
    if (!typed.current || q.length < PLACES_MIN_CHARS || (place && place.text === value)) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const ctl = new AbortController();
      abort.current = ctl;
      const res = await autocomplete(q, token.current, lang, ctl.signal);
      if (ctl.signal.aborted) return;
      setItems(res);
      setOpen(res.length > 0);
    }, PLACES_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [value, place, lang]);

  // Тап вне поля закрывает список.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Список должен быть виден над клавиатурой: поле поднимаем к верху экрана.
  useEffect(() => {
    if (open) box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [open]);

  const pick = async (s: Suggestion) => {
    const sessionToken = token.current;
    close();
    const info = await placeDetails(s.placeId, sessionToken, lang);
    token.current = newSessionToken(); // сессия закрыта выбором
    if (info) onPlace(info);
    else onText([s.main, s.secondary].filter(Boolean).join(', '));
  };

  const list = open && items.length > 0 && (
    <div className="absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-chip border border-line bg-card shadow-seg">
      <ul role="listbox">
        {items.map((s) => (
          <li key={s.placeId} role="option" aria-selected={false}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(s)}
              className="flex w-full flex-col gap-0.5 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 active:bg-bg"
            >
              <span className="text-[15px] font-bold leading-tight">{s.main}</span>
              {s.secondary && <span className="text-xs leading-tight text-ink-muted">{s.secondary}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="px-3.5 py-1 text-right text-[10px] text-ink-muted">{t('checkout.poweredBy')}</div>
    </div>
  );

  return (
    <div ref={box} className="scroll-mt-4">
      <Field
        name="address"
        label={label}
        placeholder={placeholder}
        autoComplete="street-address"
        error={error}
        value={value}
        onChange={(e) => {
          // Подсказки Google — только на набор/вставку руками; подставленное браузером — обычный текст без place_id, список не открываем.
          const it = (e.nativeEvent as InputEvent).inputType;
          typed.current = typeof it === 'string' && it !== 'insertReplacementText';
          if (!typed.current) close();
          onText(e.target.value);
        }}
        onAnimationStart={(e) => {
          if (e.currentTarget.value !== value) {
            typed.current = false;
            close();
            onText(e.currentTarget.value);
          }
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        after={list}
      />
    </div>
  );
}
