// Проверка якоря /#subscription (ссылка из напоминания о продлении): блок подписки виден, CTA открывает заказ с типом «Подписка».
//   NODE_PATH=~/.ninifood/visual-tools/node_modules node tools/visual/anchor-check.cjs http://localhost:8124 [shots-dir]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mocks = require('./mocks.cjs');
const BASE = process.argv[2] || 'http://localhost:8124';
const OUT = process.argv[3];
const FIXED = Date.UTC(2026, 9, 30, 4, 0, 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ❌', m); } else console.log('  ✅', m); };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const cases = [];
  for (const lang of ['ua', 'ru', 'en', 'vi']) for (const [w, mobile] of [[390, true], [360, true], [1280, false]]) cases.push({ lang, w, mobile, firstVisit: false });
  cases.push({ lang: 'ru', w: 390, mobile: true, firstVisit: true }, { lang: 'en', w: 1280, mobile: false, firstVisit: true });
  for (const c of cases) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: c.w, height: 800, deviceScaleFactor: 1, isMobile: c.mobile, hasTouch: c.mobile });
    await page.emulateTimezone('Asia/Ho_Chi_Minh');
    await page.evaluateOnNewDocument((FIXED, lang, first) => {
      const R = Date; const t0 = performance.now();
      class D extends R { constructor(...a) { if (a.length) super(...a); else super(FIXED + (performance.now() - t0)); } static now() { return FIXED + (performance.now() - t0); } }
      globalThis.Date = D;
      try { if (!first) localStorage.setItem('ninifood.lang', lang); } catch {}
    }, FIXED, c.lang, c.firstVisit);
    await page.setRequestInterception(true);
    page.on('request', (r) => { const x = mocks.respond(r, {}); x ? r.respond(x) : r.continue(); });
    await page.goto(`${BASE}/#subscription`, { waitUntil: 'networkidle0' });
    await sleep(1500);
    if (c.firstVisit) {
      // шторка выбора языка: выбираем язык, после закрытия страница остаётся на блоке подписки
      await page.evaluate((lang) => { const flag = { ua: '🇺🇦', ru: '🇷🇺', en: '🇬🇧', vi: '🇻🇳' }[lang]; const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(flag)); b && b.click(); }, c.lang);
      await sleep(300);
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /(Продовжити|Продолжить|Continue|Tiếp tục|Підтвердити|Подтвердить|Confirm|Xác nhận)/i.test(x.textContent)); b && b.click(); });
      await sleep(800);
    }
    const m = await page.evaluate(() => { const el = document.getElementById('subscription'); const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, sy: Math.round(scrollY), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    const tag = `${c.lang}/${c.w}${c.firstVisit ? '/first-visit' : ''}`;
    ok(m.top >= -2 && m.top < m.vh * 0.5 && m.bottom > 100 && m.sy > 200, `${tag}: блок подписки у верха экрана (top=${m.top}px, scrollY=${m.sy})`);
    ok(m.sw <= m.cw, `${tag}: нет горизонтальной прокрутки`);
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `anchor__${c.lang}__${c.w}${c.firstVisit ? '__first' : ''}.png`) }); }
    if (!c.firstVisit && c.w === 390) {
      await page.evaluate(() => [...document.querySelectorAll('#subscription button')][0].click());
      await sleep(600);
      const sel = await page.evaluate(() => { const t = document.querySelector('[role=tab][aria-selected=true]'); return t && t.textContent.trim(); });
      ok(!!sel && /(підписк|подписк|subscri|đăng ký|gói)/i.test(sel), `${tag}: кнопка блока открывает заказ с выбранным типом «Подписка» («${sel}»)`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ якорь #subscription работает');
  process.exit(fails ? 1 : 0);
})();
