/**
 * Подмена ответов Google Fonts для `next/font/google` (NEXT_FONT_GOOGLE_MOCKED_RESPONSES): CSS и woff2 лежат в репозитории,
 * сборка не ходит в Google (в CI он отдавал CSS, который next не мог разобрать, — сборка падала).
 * Файлы шрифтов подставляются абсолютными путями (next в этом режиме читает файл с диска, если путь начинается с «/»).
 * Обновить шрифты: см. tools/fonts/README.md.
 */
const path = require('path');
const css = require('./google-css.json');
const out = {};
for (const [url, text] of Object.entries(css)) {
  out[url] = text.replace(/url\(@@([^@]+)@@\)/g, (_, name) => `url(${path.join(__dirname, 'files', name)})`);
}
module.exports = out;
