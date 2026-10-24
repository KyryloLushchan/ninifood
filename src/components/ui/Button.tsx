import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'light';
type Size = 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-dark active:bg-accent-dark',
  outline: 'border-2 border-accent bg-transparent text-accent hover:bg-accent-soft/60 active:bg-accent-soft',
  light: 'bg-card text-ink hover:bg-sand active:bg-sand',
};
const SIZE: Record<Size, string> = {
  md: 'h-[52px] text-base',
  lg: 'h-[54px] text-[17px]',
  xl: 'h-14 text-[17px]',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shadow?: boolean;
}

export function Button({ variant = 'primary', size = 'lg', shadow, className = '', disabled, ...rest }: Props) {
  const look = disabled && variant === 'primary' ? 'bg-disabled text-white' : VARIANT[variant];
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`w-full rounded-md2 font-extrabold ${SIZE[size]} ${look} ${shadow && !disabled ? 'shadow-cta' : ''} ${className}`}
    />
  );
}
