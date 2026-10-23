// ---------- Настройки (временно здесь; цены потом приходят из таблицы settings) ----------
const CONFIG = {
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  WINDOW_DAYS: 7, // вкладки: сегодня + следующие 7 дней
  PRICES: {
    lunch: 160000,
    subscription5: 700000,
    delivery: 0,
  },
  // Ссылка для заказа «на сегодня» через Telegram (заглушка)
  TODAY_TELEGRAM_URL: '#',
  SOCIAL: [
    { id: 'telegram', label: 'Telegram', url: '#' },
    { id: 'instagram', label: 'Instagram', url: '#' },
    { id: 'whatsapp', label: 'WhatsApp', url: '#' },
  ],
};

// ---------- Даты (строки YYYY-MM-DD, часовой пояс Asia/Ho_Chi_Minh) ----------
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: CONFIG.TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function todayStr() {
  return dateFmt.format(new Date()); // en-CA → YYYY-MM-DD
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(str, n) {
  const d = parseDate(str);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(str) {
  return parseDate(str).getUTCDay(); // 0 = воскресенье
}

function formatDayLabel(str, lang) {
  const [, m, d] = str.split('-');
  return `${WEEKDAYS[lang][dayOfWeek(str)]}, ${d}.${m}`;
}

function formatVnd(amount, lang) {
  return `${amount.toLocaleString(NUMBER_LOCALE[lang])} ₫`;
}

// ---------- Состояние ----------
const state = {
  lang: null,
  today: todayStr(),
  menu: {},
  selectedDate: null,
};

// ---------- Меню ----------
function loadMenu() {
  // Шаг 1: тестовое меню. Позже — запрос menu_dishes из Supabase.
  state.menu = buildMockMenu(state.today, addDays, dayOfWeek);
}

// Дни во вкладках: сегодня + следующие WINDOW_DAYS, воскресенья не показываем вообще
function windowDates() {
  const dates = [];
  for (let i = 0; i <= CONFIG.WINDOW_DAYS; i++) {
    const date = addDays(state.today, i);
    if (dayOfWeek(date) !== 0) dates.push(date);
  }
  return dates;
}

function isOrderable(date) {
  return date > state.today && dayOfWeek(date) !== 0 && Boolean(state.menu[date]);
}

// Ближайший доступный день: завтра, если есть меню и не воскресенье, иначе следующий подходящий
function nearestOrderableDate() {
  return windowDates().find(isOrderable) || null;
}

// ---------- DOM-помощники ----------
const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgIcon(id, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${id}`);
  svg.appendChild(use);
  return svg;
}

// ---------- Рендер ----------
function renderStatic() {
  const lang = state.lang;
  document.documentElement.lang = { ua: 'uk', ru: 'ru', en: 'en', vi: 'vi' }[lang];
  document.title = t('metaTitle', lang);

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n, lang);
  });
  document.querySelectorAll('[data-today-telegram]').forEach((a) => {
    a.href = CONFIG.TODAY_TELEGRAM_URL;
  });

  $('#menuSub').textContent = t('menuSub', lang, { price: formatVnd(CONFIG.PRICES.lunch, lang) });
  $('#subPrice').textContent = formatVnd(CONFIG.PRICES.subscription5, lang);

  fillList($('#subPoints'), t('subPoints', lang));
  fillList($('#conditions'), t('conditions', lang));

  const steps = $('#steps');
  steps.replaceChildren();
  t('steps', lang).forEach((s) => {
    const li = el('li');
    li.append(el('h3', '', s.title), el('p', '', s.text));
    steps.appendChild(li);
  });
}

function fillList(ul, items) {
  ul.replaceChildren(...items.map((text) => el('li', '', text)));
}

function renderSocial() {
  document.querySelectorAll('[data-social]').forEach((box) => {
    const withText = box.dataset.social === 'full';
    box.replaceChildren(
      ...CONFIG.SOCIAL.map((s) => {
        const a = el('a');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', s.label);
        a.appendChild(svgIcon(s.id));
        if (withText) a.appendChild(el('span', '', s.label));
        return a;
      })
    );
  });
}

function renderHeroButton() {
  const btn = $('#heroOrderBtn');
  const date = nearestOrderableDate();
  if (date) {
    btn.textContent = t('orderFor', state.lang, { day: formatDayLabel(date, state.lang) });
    btn.disabled = false;
  } else {
    btn.textContent = t('noDays', state.lang);
    btn.disabled = true;
  }
}

function renderTabs() {
  const tabs = $('#dayTabs');
  const lang = state.lang;
  tabs.replaceChildren();

  windowDates().forEach((date) => {
    const isToday = date === state.today;
    const hasMenu = Boolean(state.menu[date]);
    const tab = el('button', 'tab' + (isToday ? ' tab-today' : ''));
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.date = date;

    const [, m, d] = date.split('-');
    tab.append(el('span', 'tab-wd', WEEKDAYS[lang][dayOfWeek(date)]), el('span', 'tab-date', `${d}.${m}`));

    if (isToday) {
      tab.disabled = true;
      tab.append(el('span', 'tab-note', t('todayTab', lang)));
    } else if (!hasMenu) {
      tab.disabled = true;
      tab.append(el('span', 'tab-note', t('noMenuTab', lang)));
    }

    const selected = date === state.selectedDate;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.addEventListener('click', () => selectDate(date));
    tabs.appendChild(tab);
  });
}

function renderDishes() {
  const box = $('#dishes');
  const lang = state.lang;
  const dishes = state.menu[state.selectedDate];
  box.replaceChildren();
  if (!dishes) return;

  dishes.forEach((dish) => {
    const card = el('article', 'dish');

    const photo = el('div', 'dish-photo');
    if (dish.photo_url) {
      const img = el('img');
      img.src = dish.photo_url;
      img.alt = dish.name[lang];
      img.loading = 'lazy';
      photo.appendChild(img);
    } else {
      photo.append(svgIcon('dish'), el('span', '', t('dishPhoto', lang)));
    }
    photo.appendChild(el('span', 'dish-num', String(dish.position)));

    const body = el('div', 'dish-body');
    body.append(el('h3', '', dish.name[lang]), el('p', '', dish.desc[lang]));

    card.append(photo, body);
    box.appendChild(card);
  });
}

function renderDynamic() {
  renderHeroButton();
  renderTabs();
  renderDishes();
}

// ---------- Действия ----------
function selectDate(date) {
  if (!isOrderable(date)) return;
  state.selectedDate = date;
  renderTabs();
  renderDishes();
}

function scrollToMenu() {
  $('#menu').scrollIntoView();
}

// Шаг 1: кнопки заказа только скроллят к меню (форма — следующий шаг)
function onOrderClick() {
  const date = nearestOrderableDate();
  if (date) selectDate(date);
  scrollToMenu();
}

// ---------- Язык ----------
function setLang(code, { persist = true } = {}) {
  state.lang = code;
  if (persist) saveLang(code);
  renderLangSwitch();
  renderStatic();
  renderDynamic();
}

function flagIcon(l) {
  return svgIcon(`f-${l.flag}`, 'flag');
}

function renderLangSwitch() {
  const cur = LANGS.find((l) => l.code === state.lang);
  const btn = $('#langCurrent');
  btn.replaceChildren(flagIcon(cur), el('span', '', cur.code.toUpperCase()));
  btn.setAttribute('aria-label', t('langLabel', state.lang));
  $('#langMenu').querySelectorAll('.lang-option').forEach((o) => {
    o.setAttribute('aria-selected', String(o.dataset.code === state.lang));
  });
}

function toggleLangMenu(open) {
  $('#langMenu').hidden = !open;
  $('#langCurrent').setAttribute('aria-expanded', String(open));
}

function buildLangUi() {
  const menu = $('#langMenu');
  const grid = $('#langGrid');
  LANGS.forEach((l) => {
    const opt = el('button', 'lang-option');
    opt.type = 'button';
    opt.setAttribute('role', 'option');
    opt.dataset.code = l.code;
    opt.append(flagIcon(l), el('span', '', l.code.toUpperCase()));
    opt.addEventListener('click', () => {
      setLang(l.code);
      toggleLangMenu(false);
    });
    menu.appendChild(opt);

    const btn = el('button', 'lang-btn');
    btn.type = 'button';
    btn.append(svgIcon(`f-${l.flag}`, 'flag flag-lg'), el('span', '', `${l.code.toUpperCase()} · ${l.name}`));
    btn.addEventListener('click', () => {
      setLang(l.code);
      closeLangModal();
    });
    grid.appendChild(btn);
  });

  $('#langCurrent').addEventListener('click', () => toggleLangMenu($('#langMenu').hidden));
  document.addEventListener('click', (e) => {
    if (!$('#langSwitch').contains(e.target)) toggleLangMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleLangMenu(false);
  });
}

function openLangModal() {
  const modal = $('#langModal');
  modal.hidden = false;
  document.body.classList.add('modal-open');
  $('.lang-btn', modal).focus();
}

function closeLangModal() {
  $('#langModal').hidden = true;
  document.body.classList.remove('modal-open');
}

// ---------- Смена суток (Asia/Ho_Chi_Minh) без перезагрузки страницы ----------
function checkDayRollover() {
  const now = todayStr();
  if (now === state.today) return;
  state.today = now;
  loadMenu();
  if (!isOrderable(state.selectedDate)) state.selectedDate = nearestOrderableDate();
  renderDynamic();
}

// ---------- Старт ----------
function init() {
  buildLangUi();
  renderSocial();
  loadMenu();
  state.selectedDate = nearestOrderableDate();

  $('#heroOrderBtn').addEventListener('click', onOrderClick);
  $('#subBtn').addEventListener('click', scrollToMenu);

  const saved = getSavedLang();
  setLang(saved || guessLang(), { persist: false });
  if (!saved) openLangModal();

  setInterval(checkDayRollover, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDayRollover();
  });
}

init();
