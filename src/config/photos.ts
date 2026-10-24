/**
 * Все пути к фото — здесь. null = показывается полосатая плашка-заглушка.
 * Файлы класть в /public/photos и указывать как '/photos/xxx.jpg'.
 */
export const PHOTOS = {
  hero: null as string | null,
  /** Фото блюда по умолчанию, если у блюда в меню нет своего. */
  dishFallback: null as string | null,
};
