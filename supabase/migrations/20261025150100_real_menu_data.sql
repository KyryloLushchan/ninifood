-- Реальное меню: недельный шаблон Пн–Сб (воскресенье выходной). КБЖУ и вес — на порцию, примерные.
-- Фото: /photos/<code>-800.webp (+ -400.webp для srcset).
with dish(code, ru, ua, en, vi, w, kcal, p, f, c) as (values
  ('borsch', 'Борщ с курицей', 'Борщ з куркою', 'Chicken borscht', 'Súp borscht gà', '450', 225, 13, 8, 25),
  ('okroshka', 'Окрошка с говяжьим языком', 'Окрошка з яловичим язиком', 'Okroshka with beef tongue', 'Okroshka (súp lạnh) với lưỡi bò', '450', 290, 14, 16, 22),
  ('sup-s-frikadelkami', 'Суп с нежными куриными фрикадельками', 'Суп з ніжними курячими фрикадельками', 'Soup with tender chicken meatballs', 'Súp viên gà mềm', '450', 245, 14, 11, 22),
  ('norvezhskaya-ukha', 'Норвежская уха', 'Норвезька рибна юшка', 'Norwegian fish soup', 'Súp cá kiểu Na Uy', '450', 360, 18, 26, 14),
  ('kuriny-sup-s-lapshoy', 'Домашний куриный суп с лапшой', 'Домашній курячий суп із локшиною', 'Homemade chicken noodle soup', 'Súp gà mì nhà làm', '450', 200, 14, 6, 22),
  ('grechka-s-gulyashom', 'Гречка с гуляшом из телятины', 'Гречка з гуляшем із телятини', 'Buckwheat with veal goulash', 'Kiều mạch với thịt bê hầm goulash', '100+', 370, 27, 11, 40),
  ('kuritsa-s-pyure', 'Куриная грудка с картофельным пюре', 'Куряча грудка з картопляним пюре', 'Chicken breast with mashed potatoes', 'Ức gà với khoai tây nghiền', '150+', 450, 50, 12, 35),
  ('ragu-iz-telyatiny', 'Рагу из телятины с овощами и картофелем', 'Рагу з телятини з овочами та картоплею', 'Veal stew with vegetables and potatoes', 'Thịt bê hầm rau củ và khoai tây', '100+', 315, 24, 11, 30),
  ('kuritsa-s-ovoshchami', 'Куриное филе с овощами', 'Куряче філе з овочами', 'Chicken fillet with vegetables', 'Phi lê gà với rau củ', '150+', 340, 49, 10, 14),
  ('ryba-s-pyure', 'Филе белой рыбы с картофельным пюре', 'Філе білої риби з картопляним пюре', 'White fish fillet with mashed potatoes', 'Phi lê cá trắng với khoai tây nghiền', '100+', 300, 25, 9, 30),
  ('ris-s-kuritsey', 'Рис с курицей в кисло-сладком соусе', 'Рис з куркою в кисло-солодкому соусі', 'Rice with chicken in sweet and sour sauce', 'Cơm gà sốt chua ngọt', '150+', 570, 50, 8, 75),
  ('salat-kapusta-ogurets', 'Хрустящий салат из капусты с огурцом', 'Хрусткий салат із капусти з огірком', 'Crunchy cabbage and cucumber salad', 'Salad bắp cải dưa leo giòn', '120', 65, 1, 4, 6),
  ('kvashenaya-kapusta', 'Квашеная капуста по-домашнему', 'Квашена капуста по-домашньому', 'Homemade sauerkraut', 'Dưa cải bắp muối nhà làm', '120', 50, 1, 3, 5),
  ('salat-tomaty-ogurtsy', 'Салат из томатов, огурцов и красного лука', 'Салат із томатів, огірків і червоної цибулі', 'Tomato, cucumber and red onion salad', 'Salad cà chua, dưa leo, hành tím', '120', 70, 1, 5, 5),
  ('olive', 'Салат «Оливье»', 'Салат «Олів’є»', 'Olivier salad', 'Salad Olivier', '120', 230, 6, 19, 9),
  ('vinegret', 'Винегрет', 'Вінегрет', 'Vinegret (beet salad)', 'Salad củ dền kiểu Nga', '120', 110, 2, 6, 12),
  ('morkov-po-koreyski', 'Морковь по-корейски', 'Морква по-корейськи', 'Korean-style carrot salad', 'Cà rốt kiểu Hàn', '120', 155, 1, 12, 11),
  ('blinchiki', 'Блинчики с бананом и сгущёнкой', 'Налисники з бананом і згущівкою', 'Crêpes with banana and condensed milk', 'Bánh crepe chuối sữa đặc', '2pc', 385, 10, 11, 63),
  ('yogurt', 'Йогурт с бананом и манго', 'Йогурт з бананом і манго', 'Yogurt with banana and mango', 'Sữa chua chuối xoài', '100', 120, 4, 3, 19)
),
week(weekday, pos, code) as (values
  (1, 1, 'borsch'),
  (1, 2, 'grechka-s-gulyashom'),
  (1, 3, 'salat-kapusta-ogurets'),
  (1, 4, 'blinchiki'),
  (2, 1, 'okroshka'),
  (2, 2, 'kuritsa-s-pyure'),
  (2, 3, 'kvashenaya-kapusta'),
  (2, 4, 'yogurt'),
  (3, 1, 'sup-s-frikadelkami'),
  (3, 2, 'ragu-iz-telyatiny'),
  (3, 3, 'salat-tomaty-ogurtsy'),
  (3, 4, 'blinchiki'),
  (4, 1, 'norvezhskaya-ukha'),
  (4, 2, 'kuritsa-s-ovoshchami'),
  (4, 3, 'olive'),
  (4, 4, 'yogurt'),
  (5, 1, 'kuriny-sup-s-lapshoy'),
  (5, 2, 'ryba-s-pyure'),
  (5, 3, 'vinegret'),
  (5, 4, 'blinchiki'),
  (6, 1, 'norvezhskaya-ukha'),
  (6, 2, 'ris-s-kuritsey'),
  (6, 3, 'morkov-po-koreyski'),
  (6, 4, 'yogurt')
)
insert into public.menu_dishes
  (weekday, position, name_ru, name_ua, name_en, name_vi, weight_label, kcal, protein, fat, carbs, photo_url)
select w.weekday, w.pos, d.ru, d.ua, d.en, d.vi, d.w, d.kcal, d.p, d.f, d.c,
       '/photos/' || d.code || '-800.webp'
from week w join dish d using (code);
