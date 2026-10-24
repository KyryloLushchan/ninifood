import type { ReactNode } from 'react';

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-6 flex transition-[transform,opacity] duration-200 [html[data-kb=open]_&]:pointer-events-none [html[data-kb=open]_&]:translate-y-full [html[data-kb=open]_&]:opacity-0 flex-col gap-3 border-t border-line bg-card px-5 pb-6 pt-4">
      {children}
    </div>
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
