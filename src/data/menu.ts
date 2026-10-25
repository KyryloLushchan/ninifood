import { PHOTOS } from '@/config/photos';
import { SUB_WINDOW_DAYS } from '@/config/site';
import { supabase } from '@/lib/supabase';
import type { Lang } from '@/i18n';
import { addDays, dayOfWeek } from '@/lib/dates';

export type DishType = 'soup' | 'salad' | 'main' | 'dessert';

export interface Nutrition {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface Dish {
  type: DishType;
  /** Название на каждом языке. */
  name: Record<Lang, string>;
  photo: string | null;
  /** '450' | '150+' (мясо + гарнир) | '2pc' — единицы подставляет фронт. */
  weight: string | null;
  /** КБЖУ на порцию; null, если не заполнено. */
  nutrition: Nutrition | null;
}
/** ISO-дата (YYYY-MM-DD) → блюда дня (из недельного шаблона). */
export type Menu = Record<string, Dish[]>;

const TYPE_BY_POSITION: DishType[] = ['soup', 'main', 'salad', 'dessert'];

interface DishRow {
  weekday: number;
  position: number;
  name_ua: string;
  name_ru: string;
  name_en: string;
  name_vi: string;
  photo_url: string | null;
  weight_label: string | null;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

/**
 * Меню — недельный шаблон (таблица menu_dishes, weekday 1=Пн … 6=Сб, читается anon-ключом).
 * Раскладываем его на даты от today на SUB_WINDOW_DAYS вперёд; дни без блюд (воскресенье,
 * незаполненный день недели) в ответе отсутствуют — фронт показывает «Меню скоро появится».
 * При ошибке сети возвращает пустое меню (то же сообщение).
 */
export async function fetchMenu(today: string): Promise<Menu> {
  const { data, error } = await supabase
    .from('menu_dishes')
    .select('weekday, position, name_ua, name_ru, name_en, name_vi, photo_url, weight_label, kcal, protein, fat, carbs')
    .order('weekday')
    .order('position');
  if (error || !data) {
    console.error('[fetchMenu]', error);
    return {};
  }
  const byWeekday: Record<number, Dish[]> = {};
  for (const r of data as DishRow[]) {
    const type = TYPE_BY_POSITION[r.position - 1];
    if (!type) continue;
    const full = r.kcal != null && r.protein != null && r.fat != null && r.carbs != null;
    (byWeekday[r.weekday] ??= []).push({
      type,
      name: { ua: r.name_ua, ru: r.name_ru, en: r.name_en, vi: r.name_vi },
      photo: r.photo_url ?? PHOTOS.dishFallback,
      weight: r.weight_label,
      nutrition: full ? { kcal: r.kcal!, protein: r.protein!, fat: r.fat!, carbs: r.carbs! } : null,
    });
  }
  const menu: Menu = {};
  for (let n = 0; n <= SUB_WINDOW_DAYS; n++) {
    const date = addDays(today, n);
    const dishes = byWeekday[dayOfWeek(date)];
    if (dishes?.length) menu[date] = dishes;
  }
  return menu;
}
