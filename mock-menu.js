// Тестовое меню (шаг 1, без Supabase). Потом заменяется чтением таблицы menu_dishes.
// Формат блюда повторяет menu_dishes: position 1–4, name/desc на ua/ru/en/vi, photo_url (null допустим).

const MOCK_MENU_DAYS_AHEAD = 14;

const MOCK_POOL = {
  soup: [
    {
      name: { ua: 'Борщ зі сметаною', ru: 'Борщ со сметаной', en: 'Borscht with sour cream', vi: 'Súp củ dền Borscht với kem chua' },
      desc: { ua: 'Класичний борщ на яловичому бульйоні', ru: 'Классический борщ на говяжьем бульоне', en: 'Classic beet soup on beef broth', vi: 'Súp củ dền cổ điển nấu từ nước hầm bò' },
    },
    {
      name: { ua: 'Курячий суп із локшиною', ru: 'Куриный суп с лапшой', en: 'Chicken noodle soup', vi: 'Súp gà mì sợi' },
      desc: { ua: 'Домашній бульйон із зеленню', ru: 'Домашний бульон с зеленью', en: 'Homemade broth with fresh herbs', vi: 'Nước dùng gà nhà nấu với rau thơm' },
    },
    {
      name: { ua: 'Гарбузовий крем-суп', ru: 'Тыквенный крем-суп', en: 'Pumpkin cream soup', vi: 'Súp kem bí đỏ' },
      desc: { ua: 'Ніжний, з вершками та насінням', ru: 'Нежный, со сливками и семечками', en: 'Silky, with cream and seeds', vi: 'Mịn mượt, với kem tươi và hạt bí' },
    },
    {
      name: { ua: 'Гороховий суп', ru: 'Гороховый суп', en: 'Split pea soup', vi: 'Súp đậu Hà Lan' },
      desc: { ua: 'Густий, із зеленою цибулею', ru: 'Густой, с зелёным луком', en: 'Thick and hearty, with spring onion', vi: 'Đặc sánh, thêm hành lá' },
    },
  ],
  main: [
    {
      name: { ua: 'Курячі котлети', ru: 'Куриные котлеты', en: 'Chicken cutlets', vi: 'Chả gà chiên' },
      desc: { ua: 'Соковиті, домашні', ru: 'Сочные, домашние', en: 'Juicy and homemade', vi: 'Mềm ngon, làm tại nhà' },
    },
    {
      name: { ua: 'Яловичий гуляш', ru: 'Говяжий гуляш', en: 'Beef goulash', vi: 'Bò hầm Goulash' },
      desc: { ua: 'Тушкований у томатному соусі', ru: 'Тушёный в томатном соусе', en: 'Slow-cooked in tomato sauce', vi: 'Hầm chậm trong sốt cà chua' },
    },
    {
      name: { ua: 'Плов із куркою', ru: 'Плов с курицей', en: 'Chicken pilaf', vi: 'Cơm Pilaf gà' },
      desc: { ua: 'Розсипчастий, зі спеціями', ru: 'Рассыпчатый, со специями', en: 'Fluffy rice with warm spices', vi: 'Cơm tơi xốp, thơm gia vị' },
    },
    {
      name: { ua: 'Запечена риба з лимоном', ru: 'Запечённая рыба с лимоном', en: 'Baked fish with lemon', vi: 'Cá nướng chanh' },
      desc: { ua: 'З овочами та зеленню', ru: 'С овощами и зеленью', en: 'With vegetables and herbs', vi: 'Ăn kèm rau củ và rau thơm' },
    },
  ],
  side: [
    {
      name: { ua: 'Картопляне пюре', ru: 'Картофельное пюре', en: 'Mashed potatoes', vi: 'Khoai tây nghiền' },
      desc: { ua: 'З вершковим маслом', ru: 'Со сливочным маслом', en: 'With butter', vi: 'Với bơ thơm béo' },
    },
    {
      name: { ua: 'Гречка з цибулею', ru: 'Гречка с луком', en: 'Buckwheat with onion', vi: 'Kiều mạch xào hành' },
      desc: { ua: 'Розсипчаста, зі смаженою цибулею', ru: 'Рассыпчатая, с жареным луком', en: 'Fluffy, with fried onion', vi: 'Tơi xốp, với hành phi' },
    },
    {
      name: { ua: 'Рис з овочами', ru: 'Рис с овощами', en: 'Rice with vegetables', vi: 'Cơm rau củ' },
      desc: { ua: 'Легкий гарнір', ru: 'Лёгкий гарнир', en: 'A light side dish', vi: 'Món ăn kèm nhẹ nhàng' },
    },
    {
      name: { ua: 'Макарони з сиром', ru: 'Макароны с сыром', en: 'Pasta with cheese', vi: 'Mì ống phô mai' },
      desc: { ua: 'З маслом і тертим сиром', ru: 'С маслом и тёртым сыром', en: 'With butter and grated cheese', vi: 'Với bơ và phô mai bào' },
    },
  ],
  extra: [
    {
      name: { ua: 'Салат «Олів’є»', ru: 'Салат «Оливье»', en: 'Olivier salad', vi: 'Salad Olivier' },
      desc: { ua: 'Класичний, з майонезом', ru: 'Классический, с майонезом', en: 'Classic potato salad', vi: 'Salad khoai tây cổ điển' },
    },
    {
      name: { ua: 'Свіжий овочевий салат', ru: 'Свежий овощной салат', en: 'Fresh vegetable salad', vi: 'Salad rau củ tươi' },
      desc: { ua: 'Огірки, помідори, олія', ru: 'Огурцы, помидоры, масло', en: 'Cucumber, tomato, olive oil', vi: 'Dưa leo, cà chua, dầu ô liu' },
    },
    {
      name: { ua: 'Сирники зі сметаною', ru: 'Сырники со сметаной', en: 'Syrniki (cheese pancakes)', vi: 'Bánh phô mai chiên Syrniki' },
      desc: { ua: 'Ніжні, на десерт', ru: 'Нежные, на десерт', en: 'Tender, for dessert', vi: 'Mềm mịn, dùng tráng miệng' },
    },
    {
      name: { ua: 'Шматочок медовика', ru: 'Кусочек медовика', en: 'Honey cake slice', vi: 'Bánh mật ong' },
      desc: { ua: 'Домашній медовий торт', ru: 'Домашний медовый торт', en: 'Homemade layered honey cake', vi: 'Bánh mật ong nhiều lớp làm tại nhà' },
    },
  ],
};

// Возвращает { 'YYYY-MM-DD': [4 блюда] } на сегодня + 14 дней вперёд, воскресенья пропущены.
// Хелперы дат передаются из app.js, чтобы не дублировать логику часового пояса.
function buildMockMenu(today, addDays, dayOfWeek) {
  const menu = {};
  const cats = ['soup', 'main', 'side', 'extra'];
  for (let i = 0; i <= MOCK_MENU_DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    if (dayOfWeek(date) === 0) continue;
    menu[date] = cats.map((cat, idx) => {
      const pool = MOCK_POOL[cat];
      const dish = pool[(i + idx * 2) % pool.length];
      return { position: idx + 1, ...dish, photo_url: null };
    });
  }
  return menu;
}
