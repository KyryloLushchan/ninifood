-- Название блинов (UA/RU); EN/VI без изменений.
update public.menu_dishes
set name_ua = 'Налисники з бананом і згущеним молоком',
    name_ru = 'Блинчики с бананом и сгущённым молоком'
where weight_label = '2pc' and name_ru = 'Блинчики с бананом и сгущёнкой';
