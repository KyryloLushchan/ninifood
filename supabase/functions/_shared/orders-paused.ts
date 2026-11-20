// Пауза приёма заказов (settings.orders_paused = '1', публичная настройка). Новые заказы и напоминания о продлении не идут; готовые заказы доставляются как обычно.
export async function ordersPaused(db: any): Promise<boolean> {
  const { data } = await db.from('settings').select('value').eq('key', 'orders_paused').maybeSingle();
  return String(data?.value ?? '').trim() === '1';
}
