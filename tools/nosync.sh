#!/bin/sh
# Проект лежит в ~/Desktop (iCloud). Тяжёлые и часто меняющиеся папки держим как <имя>.nosync (iCloud их не синхронизирует),
# а на старом месте — симлинк. `npm ci` и `next build` иногда заменяют симлинк настоящей папкой — этот скрипт возвращает как надо.
# Запуск (идемпотентно): sh tools/nosync.sh   (после `npm ci` / `npm run build`)
cd "$(dirname "$0")/.." || exit 1
for d in node_modules .next out .visual; do
  if [ -d "$d" ] && [ ! -L "$d" ]; then
    rm -rf "$d.nosync"
    mv "$d" "$d.nosync" && ln -s "$d.nosync" "$d" && echo "перенесено: $d -> $d.nosync"
  elif [ ! -e "$d" ] && [ -d "$d.nosync" ]; then
    ln -s "$d.nosync" "$d" && echo "симлинк восстановлен: $d"
  fi
done
