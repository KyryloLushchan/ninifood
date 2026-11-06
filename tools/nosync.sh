#!/bin/sh
# Проект лежит в ~/Desktop (iCloud). Тяжёлые и часто меняющиеся папки держим как <имя>.nosync (iCloud их не синхронизирует),
# а на старом месте — симлинк. `npm ci` и `next build` иногда заменяют симлинк настоящей папкой — этот скрипт возвращает как надо.
# Запускается сам: npm-скрипты postinstall и postbuild; вручную — sh tools/nosync.sh
cd "$(dirname "$0")/.." || exit 1
# Только там, где схема уже включена (есть хотя бы одна *.nosync): в CI и на чистых клонах ничего не делает.
ls -d ./*.nosync ./.*.nosync >/dev/null 2>&1 || exit 0
for d in node_modules .next out .visual; do
  if [ -d "$d" ] && [ ! -L "$d" ]; then
    rm -rf "$d.nosync"
    mv "$d" "$d.nosync" && ln -s "$d.nosync" "$d" && echo "перенесено: $d -> $d.nosync"
  elif [ ! -e "$d" ] && [ -d "$d.nosync" ]; then
    ln -s "$d.nosync" "$d" && echo "симлинк восстановлен: $d"
  fi
done
