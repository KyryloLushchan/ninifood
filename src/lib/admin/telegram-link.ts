/** @username из того, что ввёл клиент (@x, x, t.me/x, https://t.me/x); null — если не похоже на username. */
export function tgUsername(raw: string): string | null {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? h : null;
}
export const tgHref = (raw: string) => {
  const u = tgUsername(raw);
  return u ? `https://t.me/${u}` : null;
};
export const tgLabel = (raw: string) => {
  const u = tgUsername(raw);
  return u ? `@${u}` : raw.trim();
};
