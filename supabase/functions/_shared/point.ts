import { inDanang } from './danang.ts';

/** Достаёт координаты из «lat, lng» или из ссылки Google Maps (@lat,lng · !3d…!4d… · ?q=/query=/ll=lat,lng). Вне Дананга — null. */
export function parsePoint(raw: string): { lat: number; lng: number } | null {
  const text = (() => {
    try {
      return decodeURIComponent(raw.trim());
    } catch {
      return raw.trim();
    }
  })();
  const num = '(-?\\d{1,3}\\.\\d+)';
  const pats = [
    new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`),
    new RegExp(`@${num},${num}`),
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`[?&](?:q|query|ll|center|destination)=${num}[,+ ]\\s*${num}`),
  ];
  for (const re of pats) {
    const m = re.exec(text);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (inDanang(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/** Хосты, по которым разрешено разворачивать ссылку (защита от SSRF). */
export const isGoogleHost = (h: string) => /(^|\.)(google\.[a-z.]{2,6}|goo\.gl)$/i.test(h);
