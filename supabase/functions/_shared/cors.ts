// Разрешённые Origin для браузера (github.io — на переходный период, потом убрать).
const ALLOWED_ORIGINS = new Set([
  'https://ninifoodvn.com',
  'https://www.ninifoodvn.com',
  'https://kyrylolushchan.github.io',
]);

export const corsFor = (origin: string | null): Record<string, string> => ({
  ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});
