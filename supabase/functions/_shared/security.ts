const enc = new TextEncoder();

export async function sha256hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Сравнение секретов за константное время: сравниваем SHA-256 обеих строк (длина не утекает). Пустой секрет не принимается. */
export async function safeEqual(given: string, secret: string): Promise<boolean> {
  if (!secret) return false;
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(secret))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
}

/** Тип картинки по сигнатуре (magic bytes), а не по расширению/Content-Type. */
export async function detectImage(f: File): Promise<'jpeg' | 'png' | null> {
  const b = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return 'png';
  return null;
}

/** Cloudflare Turnstile siteverify. false — токена нет, он невалиден или Cloudflare недоступен. */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET') ?? '';
  if (!secret || !token || token.length > 4096) return false;
  try {
    const body = new FormData();
    body.set('secret', secret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    if (!data.success) console.warn('turnstile rejected:', JSON.stringify(data['error-codes'] ?? []));
    return data.success === true;
  } catch (e) {
    console.error('turnstile verify error:', (e as Error).message);
    return false;
  }
}
