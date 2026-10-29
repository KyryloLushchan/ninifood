import { useEffect, useLayoutEffect, useState } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Совпадает ли media-запрос (после монтирования; на сервере и в первом рендере — false, т.е. мобильная вёрстка). */
export function useMedia(query: string): boolean {
  const [yes, setYes] = useState(false);
  useIsoLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setYes(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return yes;
}

/** Десктоп-раскладка (lg, ≥ 1024 px): боковая карточка заказа, коллаж в hero и т.п. На мобильной вёрстке — false. */
export const useWide = () => useMedia('(min-width: 1024px)');
