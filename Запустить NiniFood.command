#!/bin/bash
# Двойной клик: собирает сайт и открывает его в браузере.
cd "$(dirname "$0")"
export PATH=/opt/homebrew/bin:$PATH
pkill -f "http.server 5600" 2>/dev/null
npm run build || { echo "Ошибка сборки"; read -n 1; exit 1; }
cd out
(sleep 1; open http://localhost:5600) &
echo "Сайт: http://localhost:5600  (закройте это окно, чтобы остановить)"
python3 -m http.server 5600
