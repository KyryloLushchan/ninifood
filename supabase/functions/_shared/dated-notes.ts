// Датированные заметки кухне (kitchen_notes) с @ником клиента: ник и текст для строки «📝 …» в сообщениях курьеру.

/** Первый @ник в тексте заметки (нижний регистр, без @) или null. */
export const noteNick = (text: string): string | null => {
  const m = /@([A-Za-z0-9_]{3,32})/.exec(text);
  return m ? m[1].toLowerCase() : null;
};

/** Текст для курьера: «@ник — 2 куриных супа» → «2 куриных супа» (если заметка начинается с @ника и тире); иначе заметка целиком. */
export const noteBody = (text: string): string => {
  const m = /^\s*@[A-Za-z0-9_]{3,32}\s*[—–-]\s*(.+)$/s.exec(text);
  return (m ? m[1] : text).trim();
};

/** Ник из поля orders.telegram (может быть «@name», «name», «t.me/name») → нижний регистр без @. */
export const nickKey = (telegram: string): string =>
  String(telegram ?? '').trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '').toLowerCase();
