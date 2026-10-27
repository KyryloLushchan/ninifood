// Разрешённые Origin для браузера.
const ALLOWED_ORIGINS = new Set([
  'https://ninifoodvn.com',
  'https://www.ninifoodvn.com',
]);

export const corsFor = (origin: string | null): Record<string, string> => ({
  ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});
