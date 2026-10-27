/** Прямоугольник вокруг Дананга; тот же, что DANANG_BOUNDS в src/config/google.ts. */
const LAT = [15.94, 16.14];
const LNG = [108.08, 108.32];

export const inDanang = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= LAT[0] && lat <= LAT[1] && lng >= LNG[0] && lng <= LNG[1];
