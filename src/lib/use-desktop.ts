import { useEffect, useState } from 'react';

/** Только настоящий десктоп: мышь и широкое окно. На телефоне и планшете кнопки нет. */
export function useDesktop() {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine) and (min-width: 769px)');
    const on = () => setYes(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return yes;
}
