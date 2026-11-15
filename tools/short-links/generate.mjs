// Короткие рекламные ссылки: ninifoodvn.com/<ключ> → главная с ?lang=…&s=…
// Запускается после `next build` (см. package.json). Для каждого ключа из src/config/short-links.json кладёт в out/ файл <ключ>.html:
// это копия out/index.html (те же <title>/meta — превью в Telegram/Facebook как у главной) + первый скрипт в <head>, который
// ДО загрузки приложения подменяет адрес на /?lang=…&s=… (history.replaceState, без редиректа и задержки), сохраняя utm_* и #хэш.
// Дальше сайт работает как с обычной ссылкой: код источника, визит в ad_visits, first/last в localStorage.
// Неизвестный путь (GitHub Pages отдаёт 404.html) → тоже копия главной, адрес заменяется на корень без кода.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'out');
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const links = JSON.parse(fs.readFileSync(path.join(root, 'src/config/short-links.json'), 'utf8'));

const KEY_RE = /^[a-z0-9-]{1,20}$/;
const CODE_RE = /^[a-z0-9-]{1,40}$/; // как SOURCE_RE на сайте
const LANGS = new Set(['ru', 'uk', 'en', 'vi']);
const RESERVED = new Set(['index', '404', 'admin', '_next', 'photos', 'cname', 'robots', 'sitemap', 'favicon']);

const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
if (!index.includes('<head>')) throw new Error('short-links: в out/index.html нет <head>');
const inject = (script) => index.replace('<head>', `<head><script>${script}</script>`);

const existing = new Set(fs.readdirSync(out).map((f) => f.replace(/\.[^.]+$/, '').toLowerCase()));
let n = 0;
for (const [key, v] of Object.entries(links)) {
  if (!KEY_RE.test(key)) throw new Error(`short-links: ключ «${key}» должен быть ^[a-z0-9-]{1,20}$`);
  if (RESERVED.has(key) || existing.has(key)) throw new Error(`short-links: путь /${key} уже занят сайтом`);
  if (!LANGS.has(v.lang)) throw new Error(`short-links: «${key}»: lang должен быть ru|uk|en|vi`);
  if (!CODE_RE.test(v.s)) throw new Error(`short-links: «${key}»: код s должен быть ^[a-z0-9-]{1,40}$`);
  // родительская папка пути (корень или basePath) + ?lang&s + остальные параметры ссылки (кроме своих lang/s) + хэш
  const script = `(function(){try{var l=location,p=l.pathname.replace(/[^\\/]*\\/?$/,''),q=new URLSearchParams(l.search),r;q.delete('lang');q.delete('s');r=q.toString();history.replaceState(null,'',p+'?lang=${v.lang}&s=${v.s}'+(r?'&'+r:'')+l.hash)}catch(e){}})()`;
  fs.writeFileSync(path.join(out, `${key}.html`), inject(script));
  n++;
}
// неизвестный адрес → обычная главная без кода (параметры и хэш сохраняются)
fs.writeFileSync(path.join(out, '404.html'), inject(`(function(){try{var l=location;history.replaceState(null,'','${base}/'+l.search+l.hash)}catch(e){}})()`));
console.log(`short-links: ${n} шт. + 404.html → главная`);
