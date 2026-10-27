/** Публичный ключ Google Places API (New): ограничен по HTTP-referrer (ninifoodvn.com, www, localhost) и только Places API (New). */
export const GOOGLE_PLACES_KEY = 'AIzaSyC8sXKZuX7VMrmpzYuiknbO0I4Glr_SdZM';

/** Прямоугольник вокруг Дананга (Hải Châu, Sơn Trà, Ngũ Hành Sơn, Thanh Khê, Liên Chiểu, Cẩm Lệ, Hòa Xuân). Тот же — в supabase/functions/_shared/danang.ts. */
export const DANANG_BOUNDS = {
  low: { latitude: 15.94, longitude: 108.08 },
  high: { latitude: 16.14, longitude: 108.32 },
};

export const PLACES_MAX_SUGGESTIONS = 5;
export const PLACES_MIN_CHARS = 3;
export const PLACES_DEBOUNCE_MS = 300;
