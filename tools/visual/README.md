# Визуальное сравнение (мобильная версия заморожена)

Скрипты делают скриншоты всех экранов сайта и админки на фиксированных данных (Supabase-ответы, время и Turnstile подменены)
и сравнивают их с эталоном попиксельно (допуск 0).

Нужны: Chrome в `/Applications`, `puppeteer-core` (ставится вне проекта и вне /tmp: `mkdir -p ~/.ninifood/visual-tools && cd ~/.ninifood/visual-tools && npm i puppeteer-core@23.11.1`, затем `NODE_PATH=$HOME/.ninifood/visual-tools/node_modules`), `sharp` (есть в проекте).

```bash
# 1) собрать сайт и раздать out/ (python3 -m http.server 8124 в out/)
# 2) эталон (на main, до правок) и «после»:
NODE_PATH=<путь к node_modules с puppeteer-core> node tools/visual/shoot.cjs http://localhost:8124 .visual/baseline --widths 360,375,390,430
NODE_PATH=... node tools/visual/shoot.cjs http://localhost:8124 .visual/after --widths 360,375,390,430
node tools/visual/compare.cjs .visual/baseline .visual/after   # отчёт; код выхода 1, если есть отличия
```

`.visual/` в `.gitignore`. Широкие экраны (768+) эталона не имеют — их смотрят глазами (`--widths 768,1024,1280,1440`).
