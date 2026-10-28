/** Картинка QR для показа и сохранения: PNG (долгое нажатие на iPhone предлагает «Добавить в Фото»). */
export interface QrImage {
  url: string;
  file: File;
}

const WIDTH = 1080;

/** SVG от vietqr (QR, сумма, получатель) → PNG 1080 px на белом фоне. Бросает при ошибке сети/загрузки. */
export async function renderQrPng(svgUrl: string, fileName: string): Promise<QrImage> {
  const svg = await (await fetch(svgUrl)).blob();
  if (!svg.type.includes('svg')) throw new Error('not svg');
  const src = URL.createObjectURL(svg);
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error('svg load'));
      img.src = src;
    });
    const w = img.naturalWidth || 540;
    const h = img.naturalHeight || 640;
    const c = document.createElement('canvas');
    c.width = WIDTH;
    c.height = Math.round((WIDTH * h) / w);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const png = await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('png'))), 'image/png'));
    return { url: URL.createObjectURL(png), file: new File([png], fileName, { type: 'image/png' }) };
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Запасная картинка (статичный QR): тот же интерфейс, без перерисовки. */
export async function loadStaticQr(url: string, fileName: string): Promise<QrImage> {
  const blob = await (await fetch(url)).blob();
  return { url: URL.createObjectURL(blob), file: new File([blob], fileName, { type: blob.type || 'image/jpeg' }) };
}

/** Вызывать синхронно из обработчика нажатия (iOS требует жест пользователя). На телефонах — share с файлом (в меню iOS «Сохранить изображение»), иначе обычное скачивание. */
export async function saveQr(img: QrImage): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && nav.share && nav.canShare?.({ files: [img.file] })) {
    try {
      await nav.share({ files: [img.file] });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return; // закрыл меню — не ошибка
      console.warn('[qr] share failed, downloading', e);
    }
  }
  const a = document.createElement('a');
  a.href = img.url;
  a.download = img.file.name;
  a.click();
}
