# Шрифты без обращения к Google при сборке

`next/font/google` (Lora, Nunito в `src/app/layout.tsx`) на сборке ходит в fonts.googleapis.com. В CI это сломалось
(`TypeError: Cannot read properties of null (reading '1')` в `next/font/google/loader.js`), поэтому `npm run build`
подставляет сохранённые ответы: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tools/fonts/mock.cjs` (задаётся в скрипте `build` в `package.json`
и в workflow). `google-css.json` — CSS Google (с пометками `@@имя.woff2@@`), `files/` — woff2.

Изменили шрифты/веса/подмножества в `layout.tsx` — перегенерируйте: удалить `.next`, собрать с записывающим моком (прокси, который по URL
скачивает CSS с User-Agent Chrome 104), затем скачать woff2 и заменить ссылки на `@@имя@@`. Ключи словаря — точные URL запросов next.
