import type { InputHTMLAttributes, ReactNode } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Рисуется под полем поверх следующего контента (список подсказок). */
  after?: ReactNode;
}

export function Field({ label, hint, error, after, className = '', ...rest }: Props) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <div className="relative flex flex-col">
        <input
          {...rest}
          aria-invalid={!!error}
          className={`h-[50px] rounded-chip border bg-card px-3.5 text-base text-ink placeholder:text-ink-muted/60 focus:border-accent ${
            error ? 'border-accent' : 'border-line'
          } ${className}`}
        />
        {after}
      </div>
      {error ? (
        <span className="text-xs font-bold text-accent">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}
