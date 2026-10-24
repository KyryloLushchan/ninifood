-- Seed: настройки + моковое меню на 14 дней от сегодняшней даты (Asia/Ho_Chi_Minh), без воскресений.

insert into public.settings (key, value, is_public) values
  ('price_single',       '165000',                   true),
  ('price_subscription', '750000',                   true),
  ('delivery_fee',       '0',                        true),
  ('telegram_url',       'https://t.me/ninifood_dn', true)   -- заглушка
on conflict (key) do nothing;

with days as (
  select d::date as date, (row_number() over (order by d) - 1) as n
  from generate_series(
         (now() at time zone 'Asia/Ho_Chi_Minh')::date,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date + 13,
         interval '1 day') as d
  where extract(dow from d) <> 0
),
rot (set_no, position, name_ru, name_ua, name_en, name_vi) as (
  values
    (0, 1, 'Борщ с пампушками', 'Борщ із пампушками', 'Borscht with garlic buns', 'Borscht ăn kèm bánh bao tỏi'),
    (0, 2, 'Свёкла с черносливом', 'Буряк із черносливом', 'Beetroot salad with prunes', 'Salad củ dền với mận khô'),
    (0, 3, 'Котлета по-киевски с пюре', 'Котлета по-київськи з пюре', 'Chicken Kyiv with mashed potatoes', 'Gà Kyiv với khoai tây nghiền'),
    (0, 4, 'Сырники со сметаной', 'Сирники зі сметаною', 'Syrniki with sour cream', 'Bánh syrniki với kem chua'),
    (1, 1, 'Куриный суп с лапшой', 'Курячий суп із лапшею', 'Chicken noodle soup', 'Súp gà với mì'),
    (1, 2, 'Винегрет', 'Вінегрет', 'Vinaigrette beet salad', 'Salad củ dền kiểu Nga'),
    (1, 3, 'Голубцы со сметаной', 'Голубці зі сметаною', 'Cabbage rolls with sour cream', 'Bắp cải cuốn thịt với kem chua'),
    (1, 4, 'Пирожок с вишней', 'Пиріжок із вишнею', 'Cherry pie', 'Bánh nướng nhân anh đào'),
    (2, 1, 'Солянка', 'Солянка', 'Solyanka soup', 'Súp solyanka'),
    (2, 2, 'Оливье', 'Олів’є', 'Olivier salad', 'Salad Olivier'),
    (2, 3, 'Плов с говядиной', 'Плов із яловичиною', 'Beef pilaf', 'Cơm pilaf thịt bò'),
    (2, 4, 'Медовик', 'Медовик', 'Honey cake', 'Bánh mật ong'),
    (3, 1, 'Уха из морской рыбы', 'Юшка з морської риби', 'Sea fish soup', 'Súp cá biển'),
    (3, 2, 'Капустный с морковью', 'Капустяний із морквою', 'Cabbage and carrot salad', 'Salad bắp cải cà rốt'),
    (3, 3, 'Вареники с картошкой', 'Вареники з картоплею', 'Potato vareniki', 'Bánh vareniki khoai tây'),
    (3, 4, 'Творожная запеканка', 'Сирна запіканка', 'Cottage cheese casserole', 'Bánh phô mai tươi nướng'),
    (4, 1, 'Гороховый суп', 'Гороховий суп', 'Pea soup', 'Súp đậu Hà Lan'),
    (4, 2, 'Шуба', 'Оселедець під шубою', 'Herring under a fur coat', 'Salad cá trích phủ củ dền'),
    (4, 3, 'Бефстроганов с рисом', 'Бефстроганов із рисом', 'Beef stroganoff with rice', 'Bò stroganoff với cơm'),
    (4, 4, 'Шарлотка', 'Шарлотка', 'Apple sharlotka', 'Bánh táo sharlotka'),
    (5, 1, 'Грибной крем-суп', 'Грибний крем-суп', 'Cream of mushroom soup', 'Súp kem nấm'),
    (5, 2, 'Овощной с зеленью', 'Овочевий із зеленню', 'Vegetable salad with herbs', 'Salad rau củ với rau thơm'),
    (5, 3, 'Рыбные котлеты с пюре', 'Рибні котлети з пюре', 'Fish cakes with mashed potatoes', 'Chả cá với khoai tây nghiền'),
    (5, 4, 'Оладьи с мёдом', 'Оладки з медом', 'Pancakes with honey', 'Bánh kếp mật ong'),
    (6, 1, 'Рассольник', 'Розсольник', 'Rassolnik pickle soup', 'Súp dưa chuột muối rassolnik'),
    (6, 2, 'Свекольный с чесноком', 'Буряковий із часником', 'Beetroot and garlic salad', 'Salad củ dền tỏi'),
    (6, 3, 'Жаркое в горшочке', 'Печеня в горщику', 'Pot roast', 'Thịt hầm trong nồi đất'),
    (6, 4, 'Наполеон', 'Наполеон', 'Napoleon cake', 'Bánh Napoleon'),
    (7, 1, 'Щи из свежей капусты', 'Щі зі свіжої капусти', 'Fresh cabbage soup', 'Súp bắp cải tươi'),
    (7, 2, 'Огурцы со сметаной', 'Огірки зі сметаною', 'Cucumbers with sour cream', 'Dưa chuột với kem chua'),
    (7, 3, 'Тефтели с гречкой', 'Тефтелі з гречкою', 'Meatballs with buckwheat', 'Thịt viên với kiều mạch'),
    (7, 4, 'Блины с джемом', 'Налисники з джемом', 'Crepes with jam', 'Bánh crepe mứt')
)
insert into public.menu_dishes (date, position, name_ru, name_ua, name_en, name_vi)
select days.date, rot.position, rot.name_ru, rot.name_ua, rot.name_en, rot.name_vi
from days
join rot on rot.set_no = days.n % 8
on conflict (date, position) do nothing;
