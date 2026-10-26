/** Ошибки Supabase/сети приходят на английском — в админке показываем только русский. Оригинал уходит в консоль. */
export function ruError(message: string | null | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (message) console.error('[admin]', message);
  if (!m) return 'Не удалось выполнить операцию. Попробуйте ещё раз.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed'))
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  if (m.includes('jwt') || m.includes('not authenticated') || m.includes('invalid refresh token'))
    return 'Сессия истекла. Выйдите и войдите снова.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Нет прав на это действие.';
  if (m.includes('duplicate key') || m.includes('unique constraint')) return 'Такая запись уже есть.';
  if (m.includes('violates check constraint') || m.includes('violates foreign key') || m.includes('invalid input'))
    return 'Некорректные данные. Проверьте поля.';
  return 'Не удалось выполнить операцию. Попробуйте ещё раз.';
}
