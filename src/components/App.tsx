'use client';

import { I18nProvider } from '@/i18n';
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
          <Screens />
        </div>
        <LanguageSheet />
      </AppProvider>
    </I18nProvider>
  );
}
