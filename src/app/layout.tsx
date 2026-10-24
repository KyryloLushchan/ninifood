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

export const metadata: Metadata = {
  title: 'NiniFood — домашние обеды в Дананге',
  description: 'Домашний обед из 4 блюд каждый день. Доставка 14:00–16:00 по Дананге.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F6EFE4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${lora.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
