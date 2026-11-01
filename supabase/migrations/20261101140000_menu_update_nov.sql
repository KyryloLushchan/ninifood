-- Обновление недельного шаблона меню: гречотто (Чт), окрошка (Сб), новое фото оливье, банановые оладьи; десерты по очереди.
update menu_dishes set
  name_ua = 'Гречотто з куркою', name_ru = 'Гречотто с курицей',
  name_en = 'Buckwheat risotto with chicken', name_vi = 'Kiều mạch nấu kiểu risotto với gà',
  desc_ua = null, desc_ru = null, desc_en = null, desc_vi = null,
  photo_url = '/photos/grechotto-s-kuritsey-800.webp',
  weight_label = '330', kcal = 460, protein = 44, fat = 12, carbs = 39
where weekday = 4 and position = 2;

-- Суббота, суп: копия окрошки со вторника (то же фото okroshka-800.webp)
update menu_dishes d set
  name_ua = s.name_ua, name_ru = s.name_ru, name_en = s.name_en, name_vi = s.name_vi,
  desc_ua = s.desc_ua, desc_ru = s.desc_ru, desc_en = s.desc_en, desc_vi = s.desc_vi,
  photo_url = s.photo_url, weight_label = s.weight_label,
  kcal = s.kcal, protein = s.protein, fat = s.fat, carbs = s.carbs
from menu_dishes s
where d.weekday = 6 and d.position = 1 and s.weekday = 2 and s.position = 1;

-- Оливье: то же блюдо, новое фото (файл olive-800.webp заменён)
-- Десерты (позиция 4) по очереди: Пн блины, Вт йогурт, Ср оладьи, Чт блины, Пт йогурт, Сб оладьи
update menu_dishes set
  name_ua = 'Налисники з бананом і згущеним молоком', name_ru = 'Блинчики с бананом и сгущённым молоком',
  name_en = 'Crêpes with banana and condensed milk', name_vi = 'Bánh crepe chuối sữa đặc',
  photo_url = '/photos/blinchiki-800.webp', weight_label = '2pc', kcal = 385, protein = 10, fat = 11, carbs = 63
where position = 4 and weekday in (1, 4);

update menu_dishes set
  name_ua = 'Йогурт з бананом і манго', name_ru = 'Йогурт с бананом и манго',
  name_en = 'Yogurt with banana and mango', name_vi = 'Sữa chua chuối xoài',
  photo_url = '/photos/yogurt-800.webp', weight_label = '150', kcal = 180, protein = 6, fat = 5, carbs = 28
where position = 4 and weekday in (2, 5);

update menu_dishes set
  name_ua = 'Бананові оладки', name_ru = 'Банановые оладьи',
  name_en = 'Banana pancakes', name_vi = 'Bánh chuối áp chảo',
  photo_url = '/photos/bananovye-oladi-800.webp', weight_label = '2pc', kcal = 260, protein = 6, fat = 9, carbs = 37
where position = 4 and weekday in (3, 6);
