'use client';

import { useRef } from 'react';
import { useI18n } from '@/i18n';
import { useApp } from '@/state/app-context';

/** Обязательная загрузка скриншота оплаты (QR и «Другой способ»); сжатие — в placeOrder. */
export function ScreenshotUpload() {
  const { t } = useI18n();
  const { screenshot, setScreenshot } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const ok = !!screenshot;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[17px] font-extrabold">
        {t('payment.shotTitle')} <span className="text-accent">*</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setScreenshot(f);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg2 border-2 border-dashed p-3 ${
          ok ? 'border-success bg-success-bg2' : 'border-accent bg-card'
        }`}
      >
        <span className={`break-all text-[15px] font-extrabold ${ok ? 'text-success' : 'text-accent'}`}>
          {ok ? `✓ ${screenshot.name}` : t('payment.upload')}
        </span>
        <span className="text-[13px] text-ink-muted">{ok ? t('payment.replace') : t('payment.uploadHint')}</span>
      </button>
    </div>
  );
}
