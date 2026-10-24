import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className = '', ...rest }: Props) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <input
        {...rest}
        aria-invalid={!!error}
        className={`h-[50px] rounded-chip border bg-card px-3.5 text-base text-ink placeholder:text-ink-muted/60 focus:border-accent ${
          error ? 'border-accent' : 'border-line'
        } ${className}`}
      />
      {error ? (
        <span className="text-xs font-bold text-accent">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}
