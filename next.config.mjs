// Для GitHub Pages без домена: NEXT_PUBLIC_BASE_PATH=/ninifood. С собственным доменом переменную не задаём.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статический экспорт: `npm run build` кладёт сайт в out/.
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
};
export default nextConfig;
