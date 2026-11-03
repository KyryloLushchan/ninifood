// Проверка ссылки /#subscription (напоминание о продлении): сразу экран заказа с выбранным типом «Подписка» (4 языка, телефон и десктоп, первый визит со шторкой языка).
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
  // ссылка из напоминания: /?lang=xx#subscription на чистом браузере — язык выставлен и сохранён, шторки языка нет
  for (const [q, lang] of [['uk', 'ua'], ['ua', 'ua'], ['ru', 'ru'], ['en', 'en'], ['vi', 'vi']]) for (const [w, mobile] of [[390, true], [1280, false]]) cases.push({ lang, q, w, mobile, firstVisit: true, viaUrl: true });
  cases.push({ lang: 'ua', q: 'xx', w: 390, mobile: true, firstVisit: true, viaUrl: true, invalid: true });
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
    await page.goto(`${BASE}/${c.viaUrl ? `?lang=${c.q}` : ''}#subscription`, { waitUntil: 'networkidle0' });
    await sleep(1500);
    if (c.viaUrl && !c.invalid) {
      const v = await page.evaluate(() => ({ dialog: !!document.querySelector('[role=dialog]'), saved: localStorage.getItem('ninifood.lang'), search: location.search, hash: location.hash, html: document.documentElement.lang, tab: (document.querySelector('[role=tab][aria-selected=true]') || {}).textContent }));
      const rx = { ua: /Підписка/, ru: /Подписка/, en: /subscription/i, vi: /Gói/ }[c.lang];
      ok(!v.dialog && v.saved === c.lang && v.search === '' && rx.test(v.tab || ''), `?lang=${c.q}/${c.w}: язык ${c.lang} выставлен и сохранён, шторки нет, параметр убран, «Подписка» («${(v.tab || '').trim()}»)`);
    } else if (c.invalid) {
      const v = await page.evaluate(() => ({ dialog: !!document.querySelector('[role=dialog]'), saved: localStorage.getItem('ninifood.lang') }));
      ok(v.dialog && !v.saved, '?lang=xx (неизвестный): как без параметра — шторка языка показана, ничего не сохранено');
      await ctx.close();
      continue;
    } else if (c.firstVisit) {
      // шторка выбора языка поверх экрана заказа: выбираем язык — тип «Подписка» остаётся
      await page.evaluate((lang) => { const flag = { ua: '🇺🇦', ru: '🇷🇺', en: '🇬🇧', vi: '🇻🇳' }[lang]; const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(flag)); b && b.click(); }, c.lang);
      await sleep(300);
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /(Продовжити|Продолжить|Continue|Tiếp tục|Підтвердити|Подтвердить|Confirm|Xác nhận)/i.test(x.textContent)); b && b.click(); });
      await sleep(800);
    }
    const m = await page.evaluate(() => { const t = document.querySelector('[role=tab][aria-selected=true]'); return { tab: t && t.textContent.trim(), hash: location.hash, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sy: Math.round(scrollY) }; });
    const tag = `${c.lang}/${c.w}${c.firstVisit ? '/first-visit' : ''}`;
    ok(!!m.tab && /(підписк|подписк|subscri|đăng ký|gói)/i.test(m.tab), `${tag}: сразу экран заказа с выбранным типом «Подписка» («${m.tab}»)`);
    ok(m.hash === '' && m.sy === 0, `${tag}: якорь убран из адреса, экран сверху`);
    ok(m.sw <= m.cw, `${tag}: нет горизонтальной прокрутки`);
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `anchor__${c.lang}__${c.w}${c.firstVisit ? '__first' : ''}.png`) }); }
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ ссылка #subscription открывает заказ «Подписка»');
  process.exit(fails ? 1 : 0);
})();
