const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статический экспорт: `npm run build` кладёт сайт в out/.
  // NEXT_PUBLIC_BASE_PATH задаёт workflow (CUSTOM_DOMAIN пусто → /ninifood, домен → корень).
  output: 'export',
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};
export default nextConfig;
