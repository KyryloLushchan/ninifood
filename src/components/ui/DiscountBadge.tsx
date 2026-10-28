'use client';

import { useI18n } from '@/i18n';
import { useApp } from '@/state/app-context';

/** Пометка «Ваша знижка N%» для вошедшего клиента с персональной скидкой (иначе ничего). */
export function DiscountBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { discount } = useApp();
  if (!discount) return null;
  return (
    <div className={`self-start rounded-full bg-success-bg px-3 py-1 text-[13px] font-bold text-success ${className}`}>
      🏷 {t('discount.badge', { n: discount })}
    </div>
  );
}
