// «Закрытые дни» доставки (settings.closed_days, публичная настройка: даты ГГГГ-ММ-ДД через запятую). Заказать на них нельзя; готовые заказы не трогаем.

/** «2026-11-29, 2026-11-30» → отсортированные уникальные валидные даты; мусор отбрасывается. */
export function parseClosedDays(v: unknown): string[] {
  const out = String(v ?? '')
    .split(/[\s,;]+/)
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));
  return [...new Set(out)].sort();
}

export async function loadClosedDays(db: any): Promise<Set<string>> {
  const { data } = await db.from('settings').select('value').eq('key', 'closed_days').maybeSingle();
  return new Set(parseClosedDays(data?.value));
}
