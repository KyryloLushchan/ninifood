import type { Metadata, Viewport } from 'next';
import { Lora, Nunito } from 'next/font/google';
import './globals.css';

const lora = Lora({
  subsets: ['latin', 'cyrillic', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-lora',
  display: 'swap',
});
const nunito = Nunito({
  subsets: ['latin', 'cyrillic', 'vietnamese'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

// CSP через <meta> (статический экспорт без заголовков): только свои домены, Supabase, Google Places, Turnstile, Google Fonts.
// 'unsafe-inline' для script/style нужен инлайновым скриптам Next в статической сборке. В dev не включаем (HMR).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://img.vietqr.io",
  "connect-src 'self' https://jeeaairmlcpueghttnky.supabase.co https://places.googleapis.com https://challenges.cloudflare.com https://oauth.telegram.org",
  'frame-src https://challenges.cloudflare.com https://oauth.telegram.org',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const metadata: Metadata = {
  referrer: 'strict-origin-when-cross-origin',
  title: 'NiniFood — домашние обеды в Дананге',
  description: 'Домашний обед из 4 блюд каждый день. Доставка 14:00–16:00 по Дананге.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'overlays-content', themeColor: '#F6EFE4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${lora.variable} ${nunito.variable}`}>
      {process.env.NODE_ENV === 'production' && (
        <head>
          <meta httpEquiv="Content-Security-Policy" content={CSP} />
        </head>
      )}
      <body>{children}</body>
    </html>
  );
}
