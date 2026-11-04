// ОДНОРАЗОВАЯ функция: allowed_updates вебхука бота = callback_query + message (url и секрет сохраняются). Доступ — x-cron-secret.
import { safeEqual } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  if (!(await safeEqual(req.headers.get('x-cron-secret') ?? '', Deno.env.get('CRON_SECRET') ?? ''))) return new Response('forbidden', { status: 403 });
  const info = await tg('getWebhookInfo', {});
  const url = info.result?.url as string | undefined;
  const r = await tg('setWebhook', { url, secret_token: Deno.env.get('TG_WEBHOOK_SECRET'), allowed_updates: ['callback_query', 'message'] });
  return Response.json({ ok: r.ok, description: r.description ?? null });
});
