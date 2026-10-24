'use client';

import { useEffect } from 'react';

const isTextField = (el: Element | null): el is HTMLElement =>
  !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['file', 'checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type)));

/**
 * Пока на экране мобильная клавиатура (фокус в поле или сузился visualViewport),
 * ставит html[data-kb="open"]: нижняя панель уезжает вниз и не мешает полям (стили в globals.css / BottomBar).
 * Также докручивает поле с фокусом в видимую область над клавиатурой.
 */
export function useKeyboardAwareness() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let focused = false;
    let shrunk = false;

    const apply = () => {
      if (focused || shrunk) root.dataset.kb = 'open';
      else delete root.dataset.kb;
    };

    const onVvResize = () => {
      if (!vv) return;
      shrunk = window.innerHeight - vv.height > 120;
      apply();
    };

    const reveal = (el: HTMLElement) => {
      // ждём, пока клавиатура выедет и visualViewport обновится
      window.setTimeout(() => {
        if (document.activeElement !== el) return;
        const top = vv?.offsetTop ?? 0;
        const height = vv?.height ?? window.innerHeight;
        const target = top + height * 0.35;
        const delta = el.getBoundingClientRect().top - target;
        if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: 'smooth' });
      }, 350);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextField(e.target as Element)) return;
      focused = true;
      apply();
      reveal(e.target as HTMLElement);
    };
    const onFocusOut = () => {
      // фокус может сразу перейти в другое поле — тогда панель не показываем
      window.setTimeout(() => {
        focused = isTextField(document.activeElement);
        apply();
      }, 100);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onVvResize);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onVvResize);
      delete root.dataset.kb;
    };
  }, []);
}
