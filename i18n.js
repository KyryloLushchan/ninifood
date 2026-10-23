// Все тексты интерфейса. Названия и описания блюд приходят из меню (БД), здесь их нет.
const LANGS = [
  { code: 'ua', flag: 'ua', name: 'Українська' },
  { code: 'ru', flag: 'ru', name: 'Русский' },
  { code: 'en', flag: 'gb', name: 'English' },
  { code: 'vi', flag: 'vn', name: 'Tiếng Việt' },
];

const I18N = {
  ua: {
    metaTitle: 'NiniFood — домашні обіди в Данангу',
    langModalTitle: 'Оберіть мову',
    langLabel: 'Мова',
    heroTitle: 'Домашній обід із 4 страв щодня',
    heroSub: 'Нове меню щодня. Доставка по всьому Данангу з 14:00 до 16:00.',
    orderFor: 'Замовити на {day}',
    noDays: 'Меню скоро з’явиться',
    todayAsk: 'Потрібен обід сьогодні?',
    todayLink: 'Напишіть у Telegram до 12:00',
    menuTitle: 'Меню на тиждень',
    menuSub: 'Обід із 4 страв — {price}. Неділя — вихідний.',
    todayTab: 'сьогодні — тільки через Telegram',
    noMenuTab: 'меню скоро',
    dishPhoto: 'Фото скоро',
    subTitle: 'Підписка на 5 днів',
    subText: 'Оберіть будь-які 5 буднів (Пн–Пт) з тих, на які вже опубліковане меню.',
    subPoints: [
      'Будь-які 5 буднів на ваш вибір',
      'Однакова кількість порцій на всі дні',
      'Доставка щодня з 14:00 до 16:00',
    ],
    subPriceLabel: '5 обідів',
    subBtn: 'Оформити підписку',
    howTitle: 'Як це працює',
    steps: [
      { title: 'Оберіть день', text: 'Подивіться меню на тиждень і виберіть день або підписку.' },
      { title: 'Оформіть замовлення', text: 'Вкажіть адресу й контакти, оплатіть за QR або готівкою кур’єру.' },
      { title: 'Ми готуємо', text: 'Свіжий домашній обід із 4 страв готується в день доставки.' },
      { title: 'Кур’єр привозить', text: 'З 14:00 до 16:00 за вашою адресою в Данангу.' },
    ],
    condTitle: 'Умови',
    conditions: [
      'Доставка по всьому Данангу, щодня з 14:00 до 16:00.',
      'Неділя — вихідний.',
      'Замовлення на завтра приймаємо до 23:59 сьогодні.',
      'Замовлення на сьогодні — тільки через Telegram до 12:00.',
      'Оплата: QR-код або готівка кур’єру.',
    ],
    contactsTitle: 'Контакти',
    contactsText: 'Питання, замовлення на сьогодні, побажання — пишіть нам:',
    footerNote: '© NiniFood · Дананг, В’єтнам',
  },

  ru: {
    metaTitle: 'NiniFood — домашние обеды в Дананге',
    langModalTitle: 'Выберите язык',
    langLabel: 'Язык',
    heroTitle: 'Домашний обед из 4 блюд каждый день',
    heroSub: 'Новое меню каждый день. Доставка по всему Данангу с 14:00 до 16:00.',
    orderFor: 'Заказать на {day}',
    noDays: 'Меню скоро появится',
    todayAsk: 'Нужен обед сегодня?',
    todayLink: 'Напишите в Telegram до 12:00',
    menuTitle: 'Меню на неделю',
    menuSub: 'Обед из 4 блюд — {price}. Воскресенье — выходной.',
    todayTab: 'сегодня — только через Telegram',
    noMenuTab: 'меню скоро',
    dishPhoto: 'Фото скоро',
    subTitle: 'Подписка на 5 дней',
    subText: 'Выберите любые 5 будних дней (Пн–Пт) из тех, на которые уже опубликовано меню.',
    subPoints: [
      'Любые 5 будних дней на ваш выбор',
      'Одинаковое число порций на все дни',
      'Доставка каждый день с 14:00 до 16:00',
    ],
    subPriceLabel: '5 обедов',
    subBtn: 'Оформить подписку',
    howTitle: 'Как это работает',
    steps: [
      { title: 'Выберите день', text: 'Посмотрите меню на неделю и выберите день или подписку.' },
      { title: 'Оформите заказ', text: 'Укажите адрес и контакты, оплатите по QR или наличными курьеру.' },
      { title: 'Мы готовим', text: 'Свежий домашний обед из 4 блюд готовится в день доставки.' },
      { title: 'Курьер привозит', text: 'С 14:00 до 16:00 по вашему адресу в Дананге.' },
    ],
    condTitle: 'Условия',
    conditions: [
      'Доставка по всему Данангу ежедневно с 14:00 до 16:00.',
      'Воскресенье — выходной.',
      'Заказ на завтра принимаем до 23:59 сегодня.',
      'Заказ на сегодня — только через Telegram до 12:00.',
      'Оплата: QR-код или наличные курьеру.',
    ],
    contactsTitle: 'Контакты',
    contactsText: 'Вопросы, заказ на сегодня, пожелания — пишите нам:',
    footerNote: '© NiniFood · Дананг, Вьетнам',
  },

  en: {
    metaTitle: 'NiniFood — homemade lunches in Da Nang',
    langModalTitle: 'Choose your language',
    langLabel: 'Language',
    heroTitle: 'A homemade 4-course lunch, every day',
    heroSub: 'A new menu every day. Delivery all over Da Nang, 2:00–4:00 PM.',
    orderFor: 'Order for {day}',
    noDays: 'The menu is coming soon',
    todayAsk: 'Need lunch today?',
    todayLink: 'Message us on Telegram before 12:00',
    menuTitle: 'This week’s menu',
    menuSub: '4-course lunch — {price}. Closed on Sundays.',
    todayTab: 'today — via Telegram only',
    noMenuTab: 'menu soon',
    dishPhoto: 'Photo soon',
    subTitle: '5-day subscription',
    subText: 'Pick any 5 weekdays (Mon–Fri) from the days that already have a published menu.',
    subPoints: [
      'Any 5 weekdays of your choice',
      'Same number of portions for all days',
      'Delivery every day, 2:00–4:00 PM',
    ],
    subPriceLabel: '5 lunches',
    subBtn: 'Get the subscription',
    howTitle: 'How it works',
    steps: [
      { title: 'Pick a day', text: 'Check the weekly menu and choose a day or a subscription.' },
      { title: 'Place your order', text: 'Enter your address and contacts, pay by QR or cash to the courier.' },
      { title: 'We cook', text: 'A fresh homemade 4-course lunch is prepared on the delivery day.' },
      { title: 'Courier delivers', text: 'Between 2:00 and 4:00 PM to your address in Da Nang.' },
    ],
    condTitle: 'Terms',
    conditions: [
      'Delivery all over Da Nang, daily 2:00–4:00 PM.',
      'Closed on Sundays.',
      'Orders for tomorrow are accepted until 23:59 today.',
      'Same-day orders — via Telegram only, before 12:00.',
      'Payment: QR code or cash to the courier.',
    ],
    contactsTitle: 'Contacts',
    contactsText: 'Questions, same-day orders, feedback — message us:',
    footerNote: '© NiniFood · Da Nang, Vietnam',
  },

  vi: {
    metaTitle: 'NiniFood — cơm nhà giao tận nơi tại Đà Nẵng',
    langModalTitle: 'Chọn ngôn ngữ',
    langLabel: 'Ngôn ngữ',
    heroTitle: 'Bữa trưa nhà làm 4 món mỗi ngày',
    heroSub: 'Thực đơn mới mỗi ngày. Giao hàng khắp Đà Nẵng từ 14:00 đến 16:00.',
    orderFor: 'Đặt cho {day}',
    noDays: 'Thực đơn sắp ra mắt',
    todayAsk: 'Cần bữa trưa hôm nay?',
    todayLink: 'Nhắn Telegram trước 12:00',
    menuTitle: 'Thực đơn trong tuần',
    menuSub: 'Bữa trưa 4 món — {price}. Nghỉ Chủ nhật.',
    todayTab: 'hôm nay — chỉ qua Telegram',
    noMenuTab: 'sắp có menu',
    dishPhoto: 'Sắp có ảnh',
    subTitle: 'Gói đăng ký 5 ngày',
    subText: 'Chọn 5 ngày bất kỳ trong tuần (T2–T6) trong số các ngày đã có thực đơn.',
    subPoints: [
      '5 ngày trong tuần tùy bạn chọn',
      'Số suất ăn giống nhau cho tất cả các ngày',
      'Giao mỗi ngày từ 14:00 đến 16:00',
    ],
    subPriceLabel: '5 bữa trưa',
    subBtn: 'Đăng ký gói',
    howTitle: 'Cách hoạt động',
    steps: [
      { title: 'Chọn ngày', text: 'Xem thực đơn trong tuần và chọn một ngày hoặc gói đăng ký.' },
      { title: 'Đặt hàng', text: 'Nhập địa chỉ và liên hệ, thanh toán bằng QR hoặc tiền mặt cho shipper.' },
      { title: 'Chúng tôi nấu', text: 'Bữa trưa nhà làm 4 món được nấu tươi vào đúng ngày giao.' },
      { title: 'Shipper giao tận nơi', text: 'Từ 14:00 đến 16:00 tới địa chỉ của bạn ở Đà Nẵng.' },
    ],
    condTitle: 'Điều kiện',
    conditions: [
      'Giao hàng khắp Đà Nẵng mỗi ngày từ 14:00 đến 16:00.',
      'Nghỉ Chủ nhật.',
      'Đơn cho ngày mai nhận đến 23:59 hôm nay.',
      'Đơn trong ngày — chỉ qua Telegram, trước 12:00.',
      'Thanh toán: mã QR hoặc tiền mặt cho shipper.',
    ],
    contactsTitle: 'Liên hệ',
    contactsText: 'Câu hỏi, đặt bữa trong ngày, góp ý — hãy nhắn cho chúng tôi:',
    footerNote: '© NiniFood · Đà Nẵng, Việt Nam',
  },
};

// Короткие названия дней недели, индекс = Date.getUTCDay() (0 = воскресенье)
const WEEKDAYS = {
  ua: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
};

// Локаль для форматирования чисел (цены)
const NUMBER_LOCALE = { ua: 'uk-UA', ru: 'ru-RU', en: 'en-US', vi: 'vi-VN' };

const LANG_STORAGE_KEY = 'ninifood_lang';

function getSavedLang() {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return LANGS.some((l) => l.code === v) ? v : null;
  } catch (e) {
    return null;
  }
}

function saveLang(code) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch (e) {
    /* localStorage может быть недоступен — просто не сохраняем */
  }
}

// Язык по умолчанию, пока пользователь не выбрал (для текста под модалкой)
function guessLang() {
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('uk')) return 'ua';
  if (nav.startsWith('ru')) return 'ru';
  if (nav.startsWith('vi')) return 'vi';
  return 'en';
}

// t('orderFor', 'ru', { day: 'Сб, 24.10' }) — строка или массив/объект из словаря
function t(key, lang, vars) {
  const val = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  if (typeof val !== 'string' || !vars) return val;
  return val.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
