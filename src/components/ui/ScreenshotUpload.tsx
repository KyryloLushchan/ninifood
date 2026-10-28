'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n, type TKey } from '@/i18n';
import { useDesktop } from '@/lib/use-desktop';
import { useApp } from '@/state/app-context';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT = /\.(jpe?g|png|webp)$/i;

/** Обязательная загрузка скриншота оплаты (QR и «Другой способ»); сжатие — в placeOrder. Выбор файла, drag-and-drop и вставка Ctrl/Cmd+V идут через одну проверку. */
export function ScreenshotUpload() {
  const { t } = useI18n();
  const { screenshot, setScreenshot } = useApp();
  const desktop = useDesktop();
  const fileRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<TKey | null>(null);
  const ok = !!screenshot;
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!(TYPES.includes(file.type) || (!file.type && EXT.test(file.name)))) return setError('error.screenshot_type');
      if (file.size > MAX_BYTES) return setError('error.screenshot_size');
      try {
        (await createImageBitmap(file)).close(); // действительно ли это картинка
      } catch {
        return setError('error.screenshot_type');
      }
      setError(null);
      setScreenshot(file);
    },
    [setScreenshot],
  );

  // Ctrl/Cmd+V: изображение из буфера обмена (только десктоп; текст в полях вставляется как обычно).
  useEffect(() => {
    if (!desktop) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault();
      void accept(f);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [desktop, accept]);

  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[17px] font-extrabold">
        {t('payment.shotTitle')} <span className="text-accent">*</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current++;
          setOver(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          const files = [...e.dataTransfer.files];
          void accept(files.find((f) => f.type.startsWith('image/')) ?? files[0]);
        }}
        className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg2 border-2 border-dashed p-3 ${
          over ? 'border-accent bg-accent-soft' : ok ? 'border-success bg-success-bg2' : 'border-accent bg-card'
        }`}
      >
        <span className={`break-all text-[15px] font-extrabold ${ok && !over ? 'text-success' : 'text-accent'}`}>
          {over ? t('payment.dropActive') : ok ? `✓ ${screenshot.name}` : desktop ? t('payment.drop') : t('payment.upload')}
        </span>
        <span className="text-[13px] text-ink-muted">
          {ok ? t('payment.replace') : desktop ? t('payment.pasteHint', { key: isMac ? '⌘V' : 'Ctrl+V' }) : t('payment.uploadHint')}
        </span>
      </button>
      {error && <div className="text-[13px] font-bold text-accent">{t(error)}</div>}
    </div>
  );
}
