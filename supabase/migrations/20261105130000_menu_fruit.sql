-- Десерт Вт и Пт (позиция 4): «Йогурт с бананом и манго» → «Свежие фрукты» (150 г, ≈ 95 ккал, Б1 Ж0 У23). Итоги дня: Вт 885 ккал (Б66 Ж33 У77), Пт 735 ккал (Б41 Ж25 У87).
update menu_dishes set
  name_ua = 'Свіжі фрукти', name_ru = 'Свежие фрукты',
  name_en = 'Fresh fruit', name_vi = 'Trái cây tươi',
  desc_ua = null, desc_ru = null, desc_en = null, desc_vi = null,
  photo_url = '/photos/svezhie-frukty-800.webp', weight_label = '150', kcal = 95, protein = 1, fat = 0, carbs = 23
where position = 4 and weekday in (2, 5);
