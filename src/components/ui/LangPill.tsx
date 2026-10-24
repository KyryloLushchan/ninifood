'use client';

import { LANGS, useI18n } from '@/i18n';

export function LangPill() {
  const { lang, openSheet } = useI18n();
  const cur = LANGS.find((l) => l.id === lang)!;
  return (
    <button
      onClick={openSheet}
      className="flex h-9 items-center rounded-full border border-line bg-card px-3 text-sm font-bold hover:bg-sand"
    >
      {cur.flag} {cur.short}
    </button>
  );
}
