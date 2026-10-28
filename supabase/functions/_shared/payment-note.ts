/**
 * Назначение платежа для QR: «NINIFOOD» + ник Telegram без @ (или последние 4 цифры телефона, если ника нет).
 * Только латиница и цифры, без диакритики, до 25 символов. Копия src/lib/payment-note.ts (правки вносить в обе).
 */
export function paymentNote(telegram: string, phone: string): string {
  const nick = telegram
    .trim()
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@/, '')
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '');
  const id = nick || phone.replace(/\D/g, '').slice(-4);
  return `NINIFOOD${id ? ` ${id}` : ''}`.slice(0, 25).trim();
}
