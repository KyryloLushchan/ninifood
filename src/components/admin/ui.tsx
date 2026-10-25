'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const inputCls =
  'h-11 w-full rounded-chip border border-line bg-card px-3 text-base text-ink placeholder:text-ink-muted/60 focus:border-accent';

export function Btn({
  kind = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'outline' | 'ghost' | 'danger' }) {
  const k = {
    primary: 'bg-accent text-white hover:bg-accent-dark disabled:bg-disabled',
    outline: 'border-2 border-accent text-accent hover:bg-accent-soft/60 disabled:opacity-50',
    ghost: 'border border-line bg-card text-ink hover:bg-sand disabled:opacity-50',
    danger: 'border-2 border-danger text-danger hover:bg-danger-bg disabled:opacity-50',
  }[kind];
  return <button {...rest} className={`min-h-11 rounded-md2 px-4 text-[15px] font-extrabold ${k} ${className}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md2 border border-line bg-card p-4 ${className}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[13px] font-bold text-ink-muted">{children}</div>;
}

export const Err = ({ children }: { children: ReactNode }) =>
  children ? <div className="rounded-chip bg-danger-bg px-3 py-2 text-sm font-bold text-danger">{children}</div> : null;

export const Note = ({ children }: { children: ReactNode }) => <div className="py-6 text-center text-sm text-ink-muted">{children}</div>;
