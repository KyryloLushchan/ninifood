'use client';

import { useEffect, useState } from 'react';
import { LANGS, useI18n, type Lang } from '@/i18n';
import { Button } from '../ui/Button';
import { Logo } from '../ui/ScreenHeader';

export function LanguageSheet() {
  const { lang, sheetOpen, hasChosen, confirmLang, closeSheet, tIn } = useI18n();
  const [selected, setSelected] = useState<Lang>(lang);

  useEffect(() => {
    if (sheetOpen) setSelected(lang);
  }, [sheetOpen, lang]);

  if (!sheetOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(59,43,34,.55)] md:items-center md:p-5"
      onClick={hasChosen ? closeSheet : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-app flex-col gap-5 rounded-t-sheet bg-card px-5 pb-8 pt-7 md:max-w-[440px] md:rounded-xl2 md:px-8"
      >
        <div className="flex justify-center">
          <Logo size={26} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {LANGS.map((l) => {
            const on = l.id === selected;
            return (
              <button
                key={l.id}
                onClick={() => setSelected(l.id)}
                aria-pressed={on}
                className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg2 border-2 px-2 py-4 ${
                  on ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:bg-sand'
                }`}
              >
                <span className="text-[34px] leading-none">{l.flag}</span>
                <span className="text-[15px] font-bold">{l.name}</span>
              </button>
            );
          })}
        </div>
        <Button size="md" onClick={() => confirmLang(selected)}>
          {tIn(selected, 'lang.continue')}
        </Button>
      </div>
    </div>
  );
}
