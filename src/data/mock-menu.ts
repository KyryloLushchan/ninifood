import { PHOTOS } from '@/config/photos';
import type { Lang } from '@/i18n';
import { addDays, dayOfWeek } from '@/lib/dates';

export type DishType = 'soup' | 'salad' | 'main' | 'dessert';
export interface Dish {
  type: DishType;
  /** Название на каждом языке (с бэкенда придёт так же). */
  name: Record<Lang, string>;
  photo: string | null;
}
/** ISO-дата (YYYY-MM-DD) → ровно 4 блюда. */
export type Menu = Record<string, Dish[]>;

const d = (type: DishType, ru: string, ua: string, en: string, vi: string, photo: string | null = PHOTOS.dishFallback): Dish => ({
  type,
  name: { ru, ua, en, vi },
  photo,
});

const ROTATION: Dish[][] = [
  [
    d('soup', 'Борщ с пампушками', 'Борщ із пампушками', 'Borscht with garlic buns', 'Borscht ăn kèm bánh bao tỏi'),
    d('salad', 'Свёкла с черносливом', 'Буряк із черносливом', 'Beetroot salad with prunes', 'Salad củ dền với mận khô'),
    d('main', 'Котлета по-киевски с пюре', 'Котлета по-київськи з пюре', 'Chicken Kyiv with mashed potatoes', 'Gà Kyiv với khoai tây nghiền'),
    d('dessert', 'Сырники со сметаной', 'Сирники зі сметаною', 'Syrniki with sour cream', 'Bánh syrniki với kem chua'),
  ],
  [
    d('soup', 'Куриный суп с лапшой', 'Курячий суп із лапшею', 'Chicken noodle soup', 'Súp gà với mì'),
    d('salad', 'Винегрет', 'Вінегрет', 'Vinaigrette beet salad', 'Salad củ dền kiểu Nga'),
    d('main', 'Голубцы со сметаной', 'Голубці зі сметаною', 'Cabbage rolls with sour cream', 'Bắp cải cuốn thịt với kem chua'),
    d('dessert', 'Пирожок с вишней', 'Пиріжок із вишнею', 'Cherry pie', 'Bánh nướng nhân anh đào'),
  ],
  [
    d('soup', 'Солянка', 'Солянка', 'Solyanka soup', 'Súp solyanka'),
    d('salad', 'Оливье', 'Олів’є', 'Olivier salad', 'Salad Olivier'),
    d('main', 'Плов с говядиной', 'Плов із яловичиною', 'Beef pilaf', 'Cơm pilaf thịt bò'),
    d('dessert', 'Медовик', 'Медовик', 'Honey cake', 'Bánh mật ong'),
  ],
  [
    d('soup', 'Уха из морской рыбы', 'Юшка з морської риби', 'Sea fish soup', 'Súp cá biển'),
    d('salad', 'Капустный с морковью', 'Капустяний із морквою', 'Cabbage and carrot salad', 'Salad bắp cải cà rốt'),
    d('main', 'Вареники с картошкой', 'Вареники з картоплею', 'Potato vareniki', 'Bánh vareniki khoai tây'),
    d('dessert', 'Творожная запеканка', 'Сирна запіканка', 'Cottage cheese casserole', 'Bánh phô mai tươi nướng'),
  ],
  [
    d('soup', 'Гороховый суп', 'Гороховий суп', 'Pea soup', 'Súp đậu Hà Lan'),
    d('salad', 'Шуба', 'Оселедець під шубою', 'Herring under a fur coat', 'Salad cá trích phủ củ dền'),
    d('main', 'Бефстроганов с рисом', 'Бефстроганов із рисом', 'Beef stroganoff with rice', 'Bò stroganoff với cơm'),
    d('dessert', 'Шарлотка', 'Шарлотка', 'Apple sharlotka', 'Bánh táo sharlotka'),
  ],
  [
    d('soup', 'Грибной крем-суп', 'Грибний крем-суп', 'Cream of mushroom soup', 'Súp kem nấm'),
    d('salad', 'Овощной с зеленью', 'Овочевий із зеленню', 'Vegetable salad with herbs', 'Salad rau củ với rau thơm'),
    d('main', 'Рыбные котлеты с пюре', 'Рибні котлети з пюре', 'Fish cakes with mashed potatoes', 'Chả cá với khoai tây nghiền'),
    d('dessert', 'Оладьи с мёдом', 'Оладки з медом', 'Pancakes with honey', 'Bánh kếp mật ong'),
  ],
  [
    d('soup', 'Рассольник', 'Розсольник', 'Rassolnik pickle soup', 'Súp dưa chuột muối rassolnik'),
    d('salad', 'Свекольный с чесноком', 'Буряковий із часником', 'Beetroot and garlic salad', 'Salad củ dền tỏi'),
    d('main', 'Жаркое в горшочке', 'Печеня в горщику', 'Pot roast', 'Thịt hầm trong nồi đất'),
    d('dessert', 'Наполеон', 'Наполеон', 'Napoleon cake', 'Bánh Napoleon'),
  ],
  [
    d('soup', 'Щи из свежей капусты', 'Щі зі свіжої капусти', 'Fresh cabbage soup', 'Súp bắp cải tươi'),
    d('salad', 'Огурцы со сметаной', 'Огірки зі сметаною', 'Cucumbers with sour cream', 'Dưa chuột với kem chua'),
    d('main', 'Тефтели с гречкой', 'Тефтелі з гречкою', 'Meatballs with buckwheat', 'Thịt viên với kiều mạch'),
    d('dessert', 'Блины с джемом', 'Налисники з джемом', 'Crepes with jam', 'Bánh crepe mứt'),
  ],
];

const HORIZON_DAYS = 14;

/** Мок: меню на 14 дней вперёд от today, без воскресений. */
export function buildMockMenu(today: string): Menu {
  const menu: Menu = {};
  let i = 0;
  for (let n = 0; n < HORIZON_DAYS; n++) {
    const date = addDays(today, n);
    if (dayOfWeek(date) === 0) continue;
    menu[date] = ROTATION[i++ % ROTATION.length];
  }
  return menu;
}

/** Точка подключения бэкенда: заменить тело на запрос, сигнатуру оставить. */
export async function fetchMenu(today: string): Promise<Menu> {
  return buildMockMenu(today);
}
