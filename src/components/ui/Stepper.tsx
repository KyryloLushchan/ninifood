'use client';

import { useI18n } from '@/i18n';

interface Props {
  value: number;
  onChange: (n: number) => void;
}

export function Stepper({ value, onChange }: Props) {
  const { t } = useI18n();
  const btn = 'h-11 w-11 text-[22px] text-accent';
  return (
    <div className="flex items-center rounded-full border border-line bg-card">
      <button className={btn} aria-label={t('order.minus')} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <div className="min-w-6 text-center text-[17px] font-extrabold">{value}</div>
      <button className={btn} aria-label={t('order.plus')} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
