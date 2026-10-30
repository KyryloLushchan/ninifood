// Скриншоты всех экранов сайта и админки на фиксированных данных. Использование: см. README.md
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mocks = require('./mocks.cjs');

const args = process.argv.slice(2);
const BASE = args[0];
const OUT = path.resolve(args[1]);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : d; };
const WIDTHS = opt('widths', '360,375,390,430').split(',').map(Number);
const LANGS = opt('langs', 'ua,ru,en,vi').split(',');
const ONLY = opt('only', '');
const CONC = Number(opt('conc', '4'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dict = {};
for (const l of ['ua', 'ru', 'en', 'vi']) {
  dict[l] = {};
  for (const line of fs.readFileSync(path.join(__dirname, '../../src/i18n', l + '.ts'), 'utf8').split('\n')) {
    const m = /^\s*'([^']+)':\s*(['"])(.*)\2,?\s*$/.exec(line);
    if (m) dict[l][m[1]] = m[3].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
}
const tr = (l, k) => dict[l][k] ?? dict.ru[k];

const FIXED = Date.parse('2026-10-29T05:00:00Z'); // чт 29.10.2026 12:00 по Дананг-времени

async function visible(page, text, sel = 'button, a') {
  const h = await page.evaluateHandle((text, sel) => [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null && x.textContent.trim().startsWith(text) && !x.disabled) || null, text, sel);
  const el = h.asElement();
  if (!el) throw new Error('нет кнопки: ' + text);
  return el;
}
const click = async (page, text, sel) => { await (await visible(page, text, sel)).click(); await sleep(450); };
// Перед снимком: прокрутить страницу целиком (ленивые фото), дождаться всех картинок и шрифтов, вернуться наверх
// (fixed-элементы в fullPage-снимке зависят от прокрутки).
async function stable(page) {
  await page.mouse.move(0, 0); // убрать залипший hover от последнего клика
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
    await Promise.all([...document.images].map((i) => Promise.race([i.decode().catch(() => 0), new Promise((r) => setTimeout(r, 3000))])));
    await document.fonts.ready;
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await sleep(350);
}
const settle = async (page, ms = 500) => { await page.evaluate(() => document.fonts.ready); await sleep(ms); };

async function newPage(browser, w, { mobile, lang, mode, session, draft, discount }) {
  // Отдельный контекст на страницу: localStorage (язык, сессии) не должен утекать между параллельными сценариями.
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page._ctx = ctx;
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateTimezone('Asia/Ho_Chi_Minh');
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  const state = { mode, draft, discount };
  await page.evaluateOnNewDocument((FIXED, lang, session, mode) => {
    const R = Date; const t0 = performance.now();
    class D extends R { constructor(...a) { if (a.length) super(...a); else super(FIXED + (performance.now() - t0)); } static now() { return FIXED + (performance.now() - t0); } }
    globalThis.Date = D;
    try {
      localStorage.setItem('ninifood.lang', lang);
      if (session) localStorage.setItem(mode === 'admin' ? 'ninifood.admin.auth' : 'ninifood.customer.auth', JSON.stringify(session));
    } catch {}
    window.turnstile = { render: (el, o) => { el.innerHTML = '<div style="width:300px;height:65px;border:1px solid #ccc;background:#f9f9f9"></div>'; setTimeout(() => o.callback('tok'), 30); return 'w'; }, reset() {}, remove() {} };
  }, FIXED, lang, session || null, mode);
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}';
      document.head.appendChild(s);
    });
  });
  await page.setRequestInterception(true);
  page.on('request', (r) => { const x = mocks.respond(r, state); x ? r.respond(x) : r.continue(); });
  return page;
}

// ── сценарии сайта ──
const heroText = (l) => tr(l, 'home.heroCta').split('{')[0].trim();
async function toOrder(page, l) { await click(page, heroText(l)); }
async function fillCheckout(page) {
  await page.waitForSelector('input[name=telegram]');
  const set = async (n, v) => { await page.click(`input[name=${n}]`); await page.keyboard.type(v); };
  await set('telegram', '@ninitest'); await set('phone', '901234567'); await set('address', '12 Bach Dang'); await set('hotel', 'Hotel Sun'); await set('comment', 'Call me');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await sleep(300);
}
const SITE = [
  ['home', async (p, l) => { }],
  ...[1, 2, 3, 4, 5, 6].map((i) => [`home-day${i}`, async (p) => { const tabs = await p.$$('div.overflow-x-auto.gap-2 > button'); await tabs[i - 1].click(); await p.evaluate(async () => { const el = document.querySelector('.snap-x'); let last = -1, same = 0; for (let k = 0; k < 40 && same < 4; k++) { await new Promise((r) => setTimeout(r, 100)); same = el.scrollLeft === last ? same + 1 : 0; last = el.scrollLeft; } }); await sleep(300); }]),
  ['home-lang-sheet', async (p) => { await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^(🇺🇦|🇷🇺|🇬🇧|🇻🇳)/.test(b.textContent.trim())).click()); await sleep(400); }],
  ['order-once', async (p, l) => { await toOrder(p, l); }],
  ['order-once-3days', async (p, l) => { await toOrder(p, l); const c = await p.$$('.grid-cols-7 button'); await c[1].click(); await c[2].click(); await sleep(300); }],
  ['order-sub', async (p, l) => { await toOrder(p, l); await p.evaluate(() => document.querySelector('[role=tab][aria-selected=false]').click()); await sleep(400); }],
  ['order-sub-more', async (p, l) => { await toOrder(p, l); await p.evaluate(() => document.querySelector('[role=tab][aria-selected=false]').click()); await sleep(300); const c = await p.$$('.grid-cols-7 button'); await c[c.length - 1].click(); await c[c.length - 2].click(); await sleep(300); }],
  ['checkout', async (p, l) => { await toOrder(p, l); await click(p, tr(l, 'order.next')); }],
  ['checkout-filled', async (p, l) => { await toOrder(p, l); await click(p, tr(l, 'order.next')); await fillCheckout(p); }],
  ['checkout-errors', async (p, l) => { await toOrder(p, l); await click(p, tr(l, 'order.next')); await click(p, tr(l, 'checkout.toPayment')); }],
  ['checkout-cash', async (p, l) => { await toOrder(p, l); await click(p, tr(l, 'order.next')); await fillCheckout(p); await p.evaluate(() => document.querySelectorAll('[role=radio]')[1].click()); await sleep(600); }],
  ['thanks', async (p, l) => { await toOrder(p, l); await click(p, tr(l, 'order.next')); await fillCheckout(p); await p.evaluate(() => document.querySelectorAll('[role=radio]')[1].click()); await sleep(600); await click(p, tr(l, 'checkout.send')); await sleep(900); }],
  ['payment-qr', async (p) => { await sleep(1200); }, { draft: 'qr', url: '/?d=AbCdEfGhIjKlMnOpQrStUv' }],
  ['payment-other', async (p) => { await sleep(800); }, { draft: 'other', url: '/?d=AbCdEfGhIjKlMnOpQrStUv' }],
  ['draft-stale', async (p) => { await sleep(500); }, { url: '/?d=AbCdEfGhIjKlMnOpQrStUv' }],
  ['auth-login', async (p, l) => { await click(p, tr(l, 'auth.login')); }],
  ['auth-register', async (p, l) => { await click(p, tr(l, 'auth.login')); await click(p, tr(l, 'auth.noAccount')); }],
  ['auth-forgot', async (p, l) => { await click(p, tr(l, 'auth.login')); await click(p, tr(l, 'auth.forgot')); }],
  ['home-logged', async (p) => { await sleep(400); }, { session: 'customer', discount: 30 }],
  ['home-logged-menu', async (p) => { await p.evaluate(() => document.querySelector('header button[aria-expanded]').click()); await sleep(300); }, { session: 'customer', discount: 30 }],
  ['my-orders', async (p, l) => { await p.evaluate(() => document.querySelector('header button[aria-expanded]').click()); await sleep(200); await click(p, tr(l, 'auth.myOrders')); await sleep(500); }, { session: 'customer', discount: 30 }],
  ['checkout-logged', async (p, l) => { await toOrder(p, l); await click(p, tr(l, 'order.next')); await sleep(500); }, { session: 'customer', discount: 30 }],
];
const ADMIN_TABS = [['courier', 'Курьер'], ['orders', 'Заказы'], ['subs', 'Подписки'], ['menu', 'Меню'], ['cash', 'Касса'], ['money', 'Деньги'], ['settings', 'Настройки']];
const ADMIN = [
  ['admin-login', async () => { await sleep(500); }, { noSession: true }],
  ...ADMIN_TABS.map(([id, label]) => [`admin-${id}`, async (p) => { await p.evaluate((label) => [...document.querySelectorAll('nav button')].find((b) => b.textContent.trim().endsWith(label)).click(), label); await sleep(900); }]),
  ['admin-orders-open', async (p) => { await p.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.trim().endsWith('Заказы')).click()); await sleep(700); await p.evaluate(() => document.querySelector('main [role=button]').click()); await sleep(400); }],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--disable-gpu', '--disable-lcd-text', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-checker-imaging', '--disable-partial-raster'] });
  const jobs = [];
  for (const w of WIDTHS) {
    const mobile = w < 768;
    for (const l of LANGS) for (const [name, run, o = {}] of SITE) jobs.push({ w, mobile, l, name, run, o, mode: 'site' });
    for (const [name, run, o = {}] of ADMIN) jobs.push({ w, mobile, l: 'ru', name, run, o, mode: 'admin' });
  }
  const todo = jobs.filter((j) => !ONLY || j.name.includes(ONLY));
  let done = 0, failed = [];
  const worker = async () => {
    while (todo.length) {
      const j = todo.shift(); const t0 = Date.now();
      const file = path.join(OUT, `${j.name}__${j.l}__${j.w}.png`);
      if (args.includes('--resume') && fs.existsSync(file)) { done++; continue; }
      let page;
      try {
        const session = j.o.session === 'customer' ? mocks.customerSession : j.mode === 'admin' && !j.o.noSession ? mocks.adminSession : null;
        page = await newPage(browser, j.w, { mobile: j.mobile, lang: j.l, mode: j.mode, session, draft: j.o.draft, discount: j.o.discount });
        await page.goto(BASE + (j.mode === 'admin' ? '/admin.html' : j.o.url || '/'), { waitUntil: 'networkidle0' });
        await settle(page, 700);
        await j.run(page, j.l);
        await stable(page);
        // Chrome дорисовывает фото с разным качеством ресемплинга: снимаем, пока два подряд снимка не совпадут.
        let prev = await page.screenshot({ fullPage: true });
        for (let k = 0; k < 8; k++) {
          await sleep(400);
          const cur = await page.screenshot({ fullPage: true });
          const same = Buffer.compare(prev, cur) === 0;
          prev = cur;
          if (same) break;
        }
        fs.writeFileSync(file, prev);
      } catch (e) { failed.push(`${path.basename(file)}: ${e.message}`); }
      finally { try { if (page) { const c = page._ctx; await page.close(); if (c) await c.close(); } } catch {} }
      if (Date.now() - t0 > 12000) console.log('  slow', Date.now() - t0, 'ms', path.basename(file));
      if (++done % 10 === 0) console.log(`${done} / ${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  await browser.close();
  console.log(`снимков: ${jobs.length - failed.length}, ошибок: ${failed.length}`);
  failed.forEach((f) => console.log('  FAIL', f));
}
main().catch((e) => { console.error(e); process.exit(1); });
