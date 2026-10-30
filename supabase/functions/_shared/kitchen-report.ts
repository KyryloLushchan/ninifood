import { labelRu } from './dates.ts';

/** «🍱 Порции на Пт, 31.10: 18 + 2 = 20» (+ «🍴 Приборов: N», если есть). Сообщение для повара/компаньона (группа NiniFood Ops). */
export function buildKitchenMessage(date: string, portions: number, extra: number, cutlery: number): string {
  const label = labelRu(date).replace(' ', ', ');
  const lines = [`🍱 <b>Порции на ${label}: ${portions} + ${extra} = ${portions + extra}</b>`];
  if (cutlery > 0) lines.push(`🍴 Приборов: ${cutlery}`);
  return lines.join('\n');
}
