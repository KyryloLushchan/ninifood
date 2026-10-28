'use client';

import { I18nProvider, useI18n } from '@/i18n';
import { useKeyboardAwareness } from '@/lib/use-keyboard';
import { AppProvider, useApp } from '@/state/app-context';
import { Auth } from './screens/Auth';
import { Checkout } from './screens/Checkout';
import { Home } from './screens/Home';
import { LanguageSheet } from './screens/LanguageSheet';
import { MyOrders } from './screens/MyOrders';
import { Order } from './screens/Order';
import { PaymentOther } from './screens/PaymentOther';
import { PaymentQr } from './screens/PaymentQr';
import { Thanks } from './screens/Thanks';

function DraftNotice() {
  const { t } = useI18n();
  const { draftStale, dismissDraftStale } = useApp();
  if (!draftStale) return null;
  return (
    <div role="alert" className="flex w-full items-start gap-3 bg-accent px-5 py-3 text-sm font-bold text-white">
      <span className="flex-1">{t('phone.stale')}</span>
      <button type="button" aria-label="×" onClick={dismissDraftStale} className="text-lg leading-none">×</button>
    </div>
  );
}

function Screens() {
  const { screen, payment } = useApp();
  switch (screen) {
    case 'home':
      return <Home />;
    case 'order':
      return <Order />;
    case 'checkout':
      return <Checkout />;
    case 'payment':
      return payment === 'other' ? <PaymentOther /> : <PaymentQr />;
    case 'thanks':
      return <Thanks />;
    case 'orders':
      return <MyOrders />;
    case 'auth':
      return <Auth />;
  }
}

export function App() {
  useKeyboardAwareness();
  return (
    <I18nProvider>
      <AppProvider>
        <div className="mx-auto flex min-h-screen w-full max-w-app flex-col bg-bg sm:border-x sm:border-line">
          <DraftNotice />
          <Screens />
        </div>
        <LanguageSheet />
      </AppProvider>
    </I18nProvider>
  );
}
