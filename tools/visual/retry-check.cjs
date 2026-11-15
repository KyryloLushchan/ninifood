// Проверка повторов отправки заказа (локальная сборка + моки): 1) обрыв → автоповтор с тем же x-request-id и свежим Turnstile;
// 2) три обрыва → ошибка с кнопкой «Попробовать ещё раз» и подсказкой про Telegram, отчёты в order_client_errors, затем успех по кнопке с тем же ключом;
// 3) таймаут (запрос без ответа 60 с) считается network.   Запуск: NODE_PATH=… node tools/visual/retry-check.cjs http://localhost:8124 [timeout]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mocks = require('./mocks.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2];
const withTimeout = process.argv[3] === 'timeout';
const ru = {};
for (const line of fs.readFileSync(path.join(__dirname, '../../src/i18n/ru.ts'), 'utf8').split('\n')) {
  const m = /^\s*'([^']+)':\s*(['"])(.*)\2,?\s*$/.exec(line);
  if (m) ru[m[1]] = m[3].replace(/\\'/g, "'");
}
const FIXED = Date.parse('2026-10-29T05:00:00Z');
const assert = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) process.exitCode = 1; };

async function scenario(browser, name, plan) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await page.evaluateOnNewDocument((FIXED) => {
    const R = Date; const t0 = performance.now();
    class D extends R { constructor(...a) { if (a.length) super(...a); else super(FIXED + (performance.now() - t0)); } static now() { return FIXED + (performance.now() - t0); } }
    globalThis.Date = D;
    localStorage.setItem('ninifood.lang', 'ru');
    let n = 0;
    window.__tokens = [];
    window.turnstile = { render: (el, o) => { window.__cb = o.callback; const give = () => { n++; window.__tokens.push('tok' + n); setTimeout(() => o.callback('tok' + n), 30); }; window.__give = give; el.innerHTML = '<div style="height:65px"></div>'; give(); return 'w'; }, reset() { window.__give(); }, remove() {} };
  }, FIXED);
  await page.setRequestInterception(true);
  const sends = []; const reports = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/functions\/v1\/send-order/.test(u) && r.method() === 'POST') {
      const i = sends.length;
      const body = r.postData() || '';
      sends.push({ rid: r.headers()['x-request-id'], captcha: (/"captcha":"([^"]*)"/.exec(body) || [])[1] });
      const act = plan[Math.min(i, plan.length - 1)];
      if (act === 'fail') return r.abort('failed');
      if (act === 'hang') return; // не отвечаем
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, orderNumber: 'NF-9999' }) });
    }
    if (/rest\/v1\/order_client_errors/.test(u) && r.method() === 'POST') { reports.push(JSON.parse(r.postData())); return r.respond({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' }); }
    const x = mocks.respond(r, { mode: 'site' });
    x ? r.respond(x) : r.continue();
  });
  await page.goto(base + '/', { waitUntil: 'networkidle2' });
  const click = async (text) => { const h = await page.evaluateHandle((t) => [...document.querySelectorAll('button, a')].find((x) => x.offsetParent !== null && x.textContent.trim().startsWith(t) && !x.disabled) || null, text); const el = h.asElement(); if (!el) throw new Error('нет кнопки: ' + text); await el.click(); await sleep(500); };
  await click(ru['home.heroCta'].split('{')[0].trim());
  await click(ru['order.next']);
  await page.waitForSelector('input[name=telegram]');
  const set = async (n, v) => { await page.click(`input[name=${n}]`); await page.keyboard.type(v); };
  await set('telegram', '@ninitest'); await set('phone', '901234567'); await set('address', '12 Bach Dang');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.evaluate(() => document.querySelectorAll('[role=radio]')[1].click());
  await sleep(600);
  console.log('--', name);
  await click(ru['checkout.send']);
  return { page, sends, reports, click };
}
const text = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  // 1) один обрыв → автоповтор
  {
    const s = await scenario(browser, 'один обрыв, повтор успешен', ['fail', 'ok']);
    await sleep(9000);
    assert(s.sends.length === 2, `отправок: ${s.sends.length} (ожидалось 2)`);
    assert(s.sends[0].rid && s.sends[0].rid === s.sends[1].rid, `один x-request-id: ${s.sends.map((x) => (x.rid || '').slice(0, 8))}`);
    assert(s.sends[0].captcha !== s.sends[1].captcha, `свежий Turnstile: ${s.sends.map((x) => x.captcha)}`);
    assert((await text(s.page)).includes('NF-9999'), 'экран «Спасибо» с номером заказа');
    assert(s.reports.length >= 1 && s.reports[0][0].kind === 'network', `отчёт клиента: ${JSON.stringify(s.reports[0] && Object.keys(s.reports[0][0]))}`);
    await s.page._ctx?.close?.();
  }
  // 2) три обрыва → кнопка «Попробовать ещё раз» → успех с тем же ключом
  {
    const s = await scenario(browser, 'три обрыва, затем «Попробовать ещё раз»', ['fail', 'fail', 'fail', 'ok']);
    await sleep(16000);
    const t = await text(s.page);
    assert(s.sends.length === 3, `отправок: ${s.sends.length} (ожидалось 3)`);
    assert(t.includes(ru['error.network']) && t.includes(ru['error.retry']) && t.includes('@ninifoodvn'), 'ошибка + «Попробовать ещё раз» + @ninifoodvn на экране');
    await s.page.screenshot({ path: process.env.SHOT || '/dev/null' });
    assert(s.reports.flat().length === 3, `отчётов: ${s.reports.flat().length} (ожидалось 3)`);
    await sleep(1500);
    await s.click(ru['error.retry']);
    await sleep(2500);
    assert(s.sends.length === 4 && s.sends[3].rid === s.sends[0].rid, `повтор по кнопке с тем же ключом (${s.sends.length} отправок)`);
    assert((await text(s.page)).includes('NF-9999'), 'после кнопки — «Спасибо»');
  }
  // 3) таймаут
  if (withTimeout) {
    const s = await scenario(browser, 'таймаут 60 с', ['hang', 'ok']);
    const t0 = Date.now();
    await sleep(75000);
    assert(s.sends.length === 2, `после таймаута повтор: ${s.sends.length} отправок (за ${Math.round((Date.now() - t0) / 1000)} с)`);
    assert(s.reports.flat()[0]?.kind === 'timeout', `kind=timeout: ${s.reports.flat()[0]?.kind}`);
  }
  await browser.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
