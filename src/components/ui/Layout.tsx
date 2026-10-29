import type { ReactNode } from 'react';

/**
 * Раскладки для планшета/десктопа. На мобильной вёрстке обе обёртки — `display: contents`: в потоке их нет,
 * вёрстка экрана остаётся ровно прежней (все правила только с префиксами md:/lg:).
 */

/** Узкий экран (вход, «Дякуємо», «Мої замовлення»): по центру, ~560 px (md+). */
export function Narrow({ children, max = 560 }: { children: ReactNode; max?: 440 | 560 }) {
  return <div className={`contents md:flex md:w-full md:flex-1 md:flex-col md:self-center ${max === 440 ? 'md:max-w-[440px]' : 'md:max-w-[560px]'}`}>{children}</div>;
}

/** Заказ/оформление/оплата: на ≥1024 слева контент (до 640 px), справа липкая карточка «Ваше замовлення» (её рисует BottomBar). */
export function TwoCol({ children }: { children: ReactNode }) {
  return <div className="contents lg:grid lg:grid-cols-[minmax(0,640px)_380px] lg:items-start lg:justify-start lg:gap-12 lg:px-10 lg:pb-14">{children}</div>;
}
