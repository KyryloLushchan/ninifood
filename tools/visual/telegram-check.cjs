// Сайт внутри Telegram (Mini App): эмуляция запуска (параметры tgWebApp… в адресе + заглушка telegram-web-app.js). Вне Telegram — ничего не меняется.
//   NODE_PATH=~/.ninifood/visual-tools/node_modules node tools/visual/telegram-check.cjs http://localhost:8124 [shots-dir]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mocks = require('./mocks.cjs');
const BASE = process.argv[2] || 'http://localhost:8124';
const OUT = process.argv[3];
const FIXED = Date.parse('2026-10-29T05:00:00Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ❌', m); } else console.log('  ✅', m); };

const launchHash = (user) => {
  const data = new URLSearchParams({ query_id: 'AAH123', user: JSON.stringify(user), auth_date: '1793000000', hash: 'abc' }).toString();
  return `#tgWebAppData=${encodeURIComponent(data)}&tgWebAppVersion=7.10&tgWebAppPlatform=ios&tgWebAppThemeParams=%7B%7D`;
};
const STUB = (user) => `window.Telegram = { WebApp: { initDataUnsafe: { user: ${JSON.stringify(user)} }, ready() { window.__tg = (window.__tg || {}); window.__tg.ready = 1; }, expand() { window.__tg.expand = 1; }, disableVerticalSwipes() { window.__tg.noSwipe = 1; } } };`;

async function open(browser, { url, user, state = {}, w = 390, h = 700, platform = 'ios' }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.emulateTimezone('Asia/Ho_Chi_Minh');
  await page.evaluateOnNewDocument((FIXED) => {
    const R = Date; const t0 = performance.now();
    class D extends R { constructor(...a) { if (a.length) super(...a); else super(FIXED + (performance.now() - t0)); } static now() { return FIXED + (performance.now() - t0); } }
    globalThis.Date = D;
    window.turnstile = { render: (el, o) => { el.innerHTML = '<div style="width:300px;height:65px;border:1px solid #ccc;background:#f9f9f9"></div>'; setTimeout(() => o.callback('tok'), 30); return 'w'; }, reset() {}, remove() {} };
  }, FIXED);
  const hits = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (/telegram\.org/.test(u)) { hits.push(u); return r.respond({ status: 200, contentType: 'application/javascript', body: user ? STUB(user) : '' }); }
    const x = mocks.respond(r, state); x ? r.respond(x) : r.continue();
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  await sleep(1200);
  return { page, ctx, hits, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const user = { id: 524375262, first_name: 'Кирилл', username: 'Kiruxxxa7', language_code: 'uk' };

  console.log('── вне Telegram: ничего не меняется ──');
  { const { page, ctx, hits } = await open(browser, { url: `${BASE}/` });
    ok(hits.length === 0, 'telegram-web-app.js НЕ загружается (запросов к telegram.org нет)');
    ok(await page.evaluate(() => !window.Telegram && !!document.querySelector('[role=dialog]')), 'нет window.Telegram; при первом визите, как раньше, шторка выбора языка');
    await ctx.close(); }

  console.log('\n── внутри Telegram: запуск, язык, ник ──');
  { const { page, ctx, hits, errors } = await open(browser, { url: `${BASE}/${launchHash(user)}`, user });
    ok(hits.some((u) => u.includes('telegram-web-app.js')), 'скрипт telegram-web-app.js подключён (внутри Telegram)');
    ok(await page.evaluate(() => window.__tg && window.__tg.ready === 1 && window.__tg.expand === 1 && window.__tg.noSwipe === 1), 'WebApp.ready(), expand() и disableVerticalSwipes() вызваны');
    ok(await page.evaluate(() => !document.querySelector('[role=dialog]')), 'шторка выбора языка не показывается (язык взят из Telegram)');
    ok(await page.evaluate(() => document.documentElement.lang === 'uk'), 'language_code «uk» → интерфейс на украинском');
    ok(errors.length === 0, 'ошибок JS нет' + (errors.length ? ': ' + errors[0] : ''));
    ok((await overflow(page)) <= 0, 'нет горизонтальной прокрутки на главной');
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, 'tg-home.png') }); }
    // оформление: заказ → далее → поле Telegram предзаполнено ником
    const clickText = (t) => page.evaluate((t) => { const b = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent !== null && x.textContent.trim().startsWith(t)); if (b) b.click(); return !!b; }, t);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Замовити|Заказать|Order/.test(b.textContent) && b.offsetParent !== null)?.click());
    await sleep(600);
    if (OUT) await page.screenshot({ path: path.join(OUT, 'tg-order.png'), fullPage: false });
    ok((await overflow(page)) <= 0, 'нет горизонтальной прокрутки на экране заказа');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Оформити|Оформить|Checkout|Đặt/.test(b.textContent) && b.offsetParent !== null && !b.disabled)?.click());
    await sleep(700);
    const tgVal = await page.evaluate(() => document.querySelector('input[name=telegram]')?.value);
    ok(tgVal === '@Kiruxxxa7', `в оформлении поле Telegram подставлено автоматически: «${tgVal}»`);
    await page.click('input[name=telegram]', { clickCount: 3 }); await page.keyboard.type('@other_nick');
    ok((await page.evaluate(() => document.querySelector('input[name=telegram]').value)) === '@other_nick', 'клиент может изменить ник');
    ok((await overflow(page)) <= 0, 'нет горизонтальной прокрутки на оформлении');
    // нижняя панель не перекрывает последний блок
    const gap = await page.evaluate(async () => { window.scrollTo(0, document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, 300)); const bar = [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().bottom >= innerHeight - 2 && d.getBoundingClientRect().height > 40).pop(); const last = [...document.querySelectorAll('main *, form *')].filter((e) => e.getBoundingClientRect().height > 0).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]; return bar && last ? Math.round(bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom) : null; });
    ok(gap === null || gap >= -2, `нижняя панель не перекрывает последний блок формы (зазор ${gap}px)`);
    if (OUT) await page.screenshot({ path: path.join(OUT, 'tg-checkout.png') });
    await ctx.close(); }

  console.log('\n── язык: неизвестный language_code, нет ника, выбор вручную ──');
  { const { page, ctx } = await open(browser, { url: `${BASE}/${launchHash({ id: 1, first_name: 'Hans', language_code: 'de' })}`, user: { id: 1, first_name: 'Hans', language_code: 'de' } });
    ok(await page.evaluate(() => !!document.querySelector('[role=dialog]')), 'неизвестный язык (de): обычная шторка выбора языка');
    await ctx.close(); }
  { const u2 = { id: 2, first_name: 'NoNick', language_code: 'ru' };
    const { page, ctx } = await open(browser, { url: `${BASE}/${launchHash(u2)}`, user: u2 });
    ok(await page.evaluate(() => document.documentElement.lang === 'ru'), 'language_code «ru» → русский');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Заказать/.test(b.textContent) && b.offsetParent !== null)?.click()); await sleep(500);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Оформить/.test(b.textContent) && b.offsetParent !== null && !b.disabled)?.click()); await sleep(600);
    ok((await page.evaluate(() => document.querySelector('input[name=telegram]')?.value)) === '', 'у пользователя без ника поле Telegram остаётся пустым');
    await ctx.close(); }
  { const { page, ctx } = await open(browser, { url: `${BASE}/${launchHash(user)}`, user });
    await page.evaluate(() => localStorage.setItem('ninifood.lang', 'vi')); await page.reload({ waitUntil: 'networkidle0' }); await sleep(800);
    ok(await page.evaluate(() => document.documentElement.lang === 'vi'), 'язык, выбранный клиентом ранее (vi), важнее language_code');
    await ctx.close(); }
  { const { page, ctx } = await open(browser, { url: `${BASE}/?lang=en${launchHash(user)}`, user });
    ok(await page.evaluate(() => document.documentElement.lang === 'en'), 'ссылка кнопки «🍽 Открыть меню» (?lang=en) работает внутри Telegram');
    ok(await page.evaluate(() => !location.search.includes('lang=') && location.hash.includes('tgWebAppData')), 'параметр ?lang= убран из адреса, параметры запуска Telegram сохранены');
    await ctx.close(); }

  console.log('\n── оплата QR (черновик) и Android 360 px ──');
  { const { page, ctx, errors } = await open(browser, { url: `${BASE}/?d=AbCdEfGhIjKlMnOpQrStUv${launchHash(user)}`, user, state: { draft: 'qr' }, w: 360, h: 640, platform: 'android' });
    await sleep(1500);
    ok(await page.evaluate(() => !!document.querySelector('img[src^="blob:"], img[src*="payment-qr"], img[src*="vietqr"]')), 'экран оплаты QR открылся, QR показан');
    ok((await overflow(page)) <= 0 && errors.length === 0, 'на 360 px нет горизонтальной прокрутки и ошибок JS');
    ok(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /QR/.test(b.textContent))), 'кнопка «Зберегти QR» на месте');
    if (OUT) await page.screenshot({ path: path.join(OUT, 'tg-payment-360.png') });
    await ctx.close(); }
  await browser.close();
  console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ Mini App: проверки пройдены');
  process.exit(fails ? 1 : 0);
})();
