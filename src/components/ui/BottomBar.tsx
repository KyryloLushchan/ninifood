'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Нижняя панель закреплена у низа окна; в потоке остаётся распорка высотой с панель + 16px,
 * чтобы последний блок экрана прокручивался целиком над панелью (на любом браузере, в т.ч. iOS).
 * Отступ под жестовую полосу iPhone — env(safe-area-inset-bottom) внутри панели.
 */
export function BottomBar({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden style={{ height: h + 16 }} />
      <div
        ref={bar}
        className={`fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-app flex-col border-t border-line bg-card px-5 transition-[transform,opacity] duration-200 [html[data-kb=open]_&]:pointer-events-none [html[data-kb=open]_&]:translate-y-full [html[data-kb=open]_&]:opacity-0 ${
          compact ? 'gap-2 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3' : 'gap-3 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4'
        }`}
      >
        {children}
      </div>
    </>
  );
}

export function TotalRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="font-serif text-screen font-bold">{amount}</div>
    </div>
  );
}
