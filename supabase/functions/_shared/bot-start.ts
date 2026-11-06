// /start в личке бота @nini_food_bot: приветствие на языке пользователя Telegram и кнопка Mini App «🍽 Открыть меню».
export const MINI_APP_URL = 'https://ninifoodvn.com';

export type StartLang = 'ru' | 'uk' | 'en' | 'vi';
/** language_code Telegram → язык ответа (ru / uk / en / vi, иначе en). */
export const startLang = (code?: string | null): StartLang => {
  const c = (code ?? '').toLowerCase().slice(0, 2);
  return c === 'ru' ? 'ru' : c === 'uk' ? 'uk' : c === 'vi' ? 'vi' : 'en';
};

const TEXT: Record<StartLang, (name: string) => string> = {
  ru: (n) => `Привет, ${n}! 👋 Это NiniFood — домашние обеды с доставкой в Дананге 🍲 Нажмите кнопку ниже, чтобы посмотреть меню и заказать 👇`,
  uk: (n) => `Привіт, ${n}! 👋 Це NiniFood — домашні обіди з доставкою в Дананзі 🍲 Натисніть кнопку нижче, щоб переглянути меню та замовити 👇`,
  en: (n) => `Hi, ${n}! 👋 This is NiniFood — home-cooked lunches delivered in Da Nang 🍲 Tap the button below to see the menu and order 👇`,
  vi: (n) => `Xin chào, ${n}! 👋 Đây là NiniFood — bữa trưa nhà làm giao tận nơi ở Đà Nẵng 🍲 Nhấn nút bên dưới để xem thực đơn và đặt món 👇`,
};

/** Сообщение /start: текст (без разметки, имя вставляется как есть) и inline-кнопка web_app с ?lang=xx. */
export function startMessage(user: { first_name?: string; username?: string; language_code?: string }) {
  const lang = startLang(user.language_code);
  const name = (user.first_name ?? '').trim() || (user.username ? `@${user.username}` : '') || (lang === 'ru' ? 'друг' : lang === 'uk' ? 'друже' : lang === 'vi' ? 'bạn' : 'friend');
  return {
    lang,
    text: TEXT[lang](name),
    reply_markup: { inline_keyboard: [[{ text: '🍽 Открыть меню', web_app: { url: `${MINI_APP_URL}/?lang=${lang}` } }]] },
  };
}

/** /start (в т.ч. `/start payload` и `/start@бот`) в личном чате. */
export const isStartCommand = (text: unknown): boolean => typeof text === 'string' && /^\/start(@\w+)?(\s|$)/i.test(text.trim());

/** Описание бота (setMyDescription / setMyShortDescription) на 4 языках; en — для остальных. */
export const BOT_DESCRIPTION: Record<StartLang, string> = {
  ru: 'Домашние обеды каждый день с доставкой в Дананге. Заказ на завтра или подписка от 5 дней.',
  uk: 'Домашні обіди щодня з доставкою в Дананзі. Замовлення на завтра або підписка від 5 днів.',
  en: 'Home-cooked lunches every day, delivered in Da Nang. Order for tomorrow or subscribe from 5 days.',
  vi: 'Bữa trưa nhà làm mỗi ngày, giao tận nơi ở Đà Nẵng. Đặt cho ngày mai hoặc đăng ký gói từ 5 ngày.',
};
