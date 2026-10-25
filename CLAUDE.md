# NiniFood — доставка домашних обедов в Дананге

## Суть
Каждый день новый обед из 4 блюд. Доставка с 14:00 до 16:00 по всему Данангу, Пн–Сб. Воскресенье — выходной.
Часовой пояс для всех расчётов дат: `Asia/Ho_Chi_Minh` (UTC+7).
Аудитория — туристы и экспаты. Языки: UA / RU / EN / VI.

## Стек
- Фронт: **Next.js 14 (App Router) + TypeScript + Tailwind**, mobile-first (макет 375 px, на десктопе контент по центру, max-width 480 px).
- **Static export** (`output: 'export'`): `npm run build` собирает сайт в `out/`, оттуда он публикуется на GitHub Pages (свой домен).
- Node: нужна версия ≥ 18.17 (локально — `/opt/homebrew/bin`, Node 26).
- Бэкенд (БД подключена, функции и бот — позже, см. ниже): отдельный проект Supabase `nini_food`, Telegram-бот.

## Структура
- `src/app/` — layout (шрифты Lora + Nunito), page, globals.css.
- `src/components/App.tsx` — корень: провайдеры + выбор экрана (навигация через состояние, без роутов).
- `src/components/screens/` — экраны: LanguageSheet (01), Home (02), Order (03/04), Checkout (05), PaymentQr (06), Thanks (07).
- `src/components/ui/` — мелкие компоненты (Button, Field, Stepper, DayChip, Photo, BottomBar, ScreenHeader, LangPill).
- `src/config/` — `site.ts` (цены, часы, контакты, реквизиты VietQR, число доступных дней), `photos.ts` (все пути к фото в одном месте).
- `src/data/mock-menu.ts` — `fetchMenu` (читает `menu_dishes` из Supabase anon-ключом) и `buildMockMenu` (мок для разработки).
- `src/config/supabase.ts`, `src/lib/supabase.ts` — URL и anon key (публичные) и клиент.
- `supabase/` — миграции и `seed.sql` (проект `nini_food`).
- `src/i18n/` — словари `ru/ua/en/vi.ts` + провайдер языка (выбор хранится в localStorage). Все тексты интерфейса — только здесь.
- `src/lib/` — `dates.ts` (даты по Дананг-времени), `pricing.ts`, `format.ts`, `submit-order.ts`.
- `src/state/app-context.tsx` — состояние заказа.
- `design/` — дизайн-референс (README с описанием экранов, HTML-макет, support.js). Это не продакшн-код.
- `public/photos/` — фото блюд (пока в коде не подключены; пути указывать в `src/config/photos.ts`).
- Дизайн-токены (цвета, радиусы, шрифты, тени) — в `tailwind.config.ts`, значения строго из `design/README.md`.

## Флоу и экраны
Выбран флоу **1a «без корзины»**; флоу 1b (корзина) не реализуем.
01 Выбор языка → 02 Главная → 03 Заказ «Разовый» / 04 Заказ «Подписка» → 05 Оформление → 06 Оплата QR (или наличные → сразу 07) → 07 Спасибо.

## Продукты и правила
- **Разовый заказ** — любые дни Пн–Сб из ближайших доступных (`BOOKABLE_DAYS`, сейчас 6), кроме сегодняшнего. Дни выбираются по календарю, независимо от наличия меню: если на день меню не опубликовано (нет строк в `menu_dishes`), день всё равно можно заказать, а в меню показывается «Меню скоро появится». Мультивыбор дней × порции × 165 000 ₫. При выборе 5+ будних дней — подсказка перейти на подписку.
- **Подписка** — ровно 5 будних дней (Пн–Пт) из ближайших 2 недель; меню на выбранные дни может быть ещё не опубликовано. По умолчанию отмечены ближайшие 5. Цена 750 000 ₫ × порции (150 000 ₫ за обед).
- Порции — любое число ≥ 1 (для подписки одинаково на все 5 дней).
- Воскресенья недоступны. Заказ на сегодня через сайт **не принимается** — только через Telegram до 10:00 (ссылка на сайте).
- Кнопка hero — «Заказать на {ближайший доступный день}».
- Источник истины по ценам — таблица `settings` в Supabase. Значения в `src/config/site.ts` — только для показа на сайте до подключения бэкенда. Сервер **всегда считает сумму сам**, клиенту не доверяем.

## Форма заказа
Поля: Telegram*, адрес*, отель, комментарий. Имени и телефона нет.
Оплата: QR (VietQR с суммой и номером заказа) или наличные курьеру. При QR **обязательно** скриншот оплаты (jpg/png); перед отправкой он сжимается на клиенте до ~1280px по длинной стороне (JPEG). Наличные → сразу экран «Спасибо».
Клиенту никаких уведомлений о смене статуса не шлём; подтверждает менеджер вручную.

## Бэкенд (шаг 3 готов: заказы через edge-функцию и Telegram-бота; Turnstile и VietQR пока нет)
Точки подключения во фронте:
- `submitOrder` в `src/lib/submit-order.ts` — multipart POST в `send-order` (поле `payload` JSON + `screenshot`). Ответ `{ok, orderNumber}` или `{ok:false, code}`; коды переводятся в `error.*` (i18n).
- `fetchMenu` в `src/data/mock-menu.ts` — читает `menu_dishes` из Supabase.
- Скриншот сжимается на клиенте (`src/lib/compress-image.ts`) до 1280px JPEG.

Edge-функции (`supabase/functions/`, общий код в `_shared/`):
1. `send-order` (verify_jwt = true, вызывается с anon JWT): валидирует (Telegram и адрес обязательны; дни — не сегодня, не воскресенье, в окне 14 дней; разовый — 1+ дней из ближайших 6 доступных; подписка — ровно 5 разных будних; qty 1–99; при QR скриншот jpg/png ≤ 5 МБ); **считает сумму по `settings`** (`price_single`, `price_subscription`); пишет `orders` + `order_days` (номер `NF-xxxx` даёт БД через `order_number_seq`); шлёт сообщение в группу Orders (при QR — фото с подписью, а если подпись > 1024 символов, то текст и фото ответом) с кнопками ✅ Подтвердить / ❌ Отклонить; сохраняет `tg_message_id` и `receipt_file_id`. Если Telegram не принял сообщение — клиенту всё равно успех, `tg_message_id` остаётся `null` (по нему в админке ищем неотправленные), в логе номер заказа.
2. `tg-webhook` (verify_jwt = false): проверяет заголовок `X-Telegram-Bot-Api-Secret-Token`; кнопки жмут только id из `ADMIN_TG_IDS`; ✅ → `confirmed`, ❌ → `cancelled`, после ✅ остаётся «↩️ Отменить»; пишет `status_changed_at/by`; редактирует сообщение (статус, кто, время Дананга). Вебхук зарегистрирован через `setWebhook` (allowed_updates: callback_query).
3. Секреты Supabase: `TELEGRAM_BOT_TOKEN`, `TG_WEBHOOK_SECRET`, `ORDERS_CHAT_ID`, `ADMIN_TG_IDS`. Бот: @nini_food_bot. Значения нигде, кроме секретов, не хранить.
4. Деплой: `supabase functions deploy <name> --project-ref jeeaairmlcpueghttnky` (tg-webhook — с `--no-verify-jwt`). Для CLI-команд, которым нужен токен, владелец разрешил передавать `SUPABASE_ACCESS_TOKEN` через env только на время команды, без записи в файлы и вывод.
5. Не сделано: Turnstile и проверка гео, VietQR (в назначение платежа номер заказа пока попасть не может — он выдаётся после отправки), админка, лимиты от спама, `delivery_fee` не учитывается в сумме.

Статусы: `new` → `confirmed` → `delivered` / `cancelled`.

Модель данных (черновик):
- `settings` (key, value) — цены, доставка, ссылка Telegram для заказов на сегодня.
- `menu_dishes` (id, date, position 1–4, name_ua/ru/en/vi, desc_ua/ru/en/vi, photo_url, null допустим).
- `orders` (id, order_number `NF-xxxx`, created_at, type `single|subscription`, telegram, address, hotel, comment, payment_method `qr|cash`, qty, total, status, tg_message_id, receipt_file_id, status_changed_at, status_changed_by — telegram username админа, нажавшего ✅/❌).
- `order_days` (id, order_id, delivery_date, qty, delivered bool).
- `admins` (user_id) + функция `is_admin()`.

RLS: анонимный клиент читает только `menu_dishes` и публичные `settings`. Запись заказов — только через edge-функцию (service role).

## Админка (`admin`-страница, интерфейс на английском)
Защищена (Supabase Auth + RLS, `is_admin()`).
- Меню на неделю: редактирование 4 блюд на каждую дату (4 языка, фото-URL).
- Цены/настройки.
- Заказы: фильтр по дате доставки и статусу.
- **Список для курьера на дату**: адрес, отель, Telegram, порции, способ оплаты (наличные — сумма к получению), комментарий. Кнопка «отметить доставлено».
- Сводка «на дату N порций».

## ЖЁСТКОЕ ПРАВИЛО: Supabase
- В другом аккаунте Supabase есть проект `nini_sushi`. Его **НЕЛЬЗЯ трогать никогда**: ни читать, ни линковать, ни менять. Работаем только с проектом `nini_food` (ref `jeeaairmlcpueghttnky`, регион ap-northeast-2).
- Перед каждой командой `supabase`, которая что-то меняет (`link`, `db push`, `functions deploy`, `secrets set`), выполнить `supabase projects list` и убедиться, что работаем с `nini_food`. Если в списке виден `nini_sushi` — сразу остановиться и сообщить владельцу.
- Токены, пароли БД и service role key не записывать в файлы проекта, `.env`, CLAUDE.md, коммиты и логи.

## Правила работы
- Не добавлять функциональность, которой нет в этом файле или в `design/README.md`, без вопроса.
- Секреты (service role key, токен бота, Turnstile secret) — только в секретах Supabase, никогда во фронте и в git.
- Перед крупными изменениями — сначала короткий план, потом код.
- Все тексты — через `src/i18n`, не хардкодить в компонентах; цвета и размеры — через токены Tailwind.
- В папке `_ref-ninisushi/` (если есть) лежит код NiniSushi только для справки по паттернам. Его не изменять и в проект не подключать.
