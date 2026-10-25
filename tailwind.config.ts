import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F6EFE4',
        card: '#FFFBF5',
        sand: '#EADFCF',
        accent: { DEFAULT: '#B9532F', dark: '#A24726', soft: '#F3DCCF', onDark: '#F3C9B5' },
        ink: { DEFAULT: '#3B2B22', 2: '#5E4B3E', muted: '#7A6656', onDark: '#E9DCCD' },
        line: '#E2D3BF',
        danger: { DEFAULT: '#B3261E', bg: '#FDECEA' },
        disabled: '#C9B8A6',
        success: { DEFAULT: '#4F7A4A', bg: '#DDE8D6', bg2: '#EEF3EA' },
      },
      fontFamily: {
        serif: ['var(--font-lora)', 'Lora', 'serif'],
        sans: ['var(--font-nunito)', 'Nunito', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sheet: '28px',
        xl2: '24px',
        lg2: '18px',
        md2: '16px',
        chip: '14px',
      },
      boxShadow: {
        cta: '0 8px 20px rgba(185,83,47,.3)',
        seg: '0 2px 6px rgba(59,43,34,.1)',
      },
      fontSize: {
        h1: ['32px', '1.15'],
        h2: ['24px', '1.2'],
        screen: ['22px', '1.2'],
      },
      maxWidth: { app: '480px' },
      backgroundImage: {
        stripes: 'repeating-linear-gradient(135deg,#EADFCF 0 8px,#F1E8DA 8px 16px)',
        'stripes-qr': 'repeating-linear-gradient(45deg,#E6DACB 0 6px,#F6EFE4 6px 12px)',
      },
    },
  },
  plugins: [],
};
export default config;
