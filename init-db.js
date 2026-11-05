/**
 * Создание базы данных (JSON)
 * Запуск: node init-db.js
 */
const fs = require('fs');
const path = require('path');
const { load, save, nextId, dbPath } = require('./db');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Старая база удалена');
}

const data = load();

console.log('Создаём данные...');

// Категории
const cats = [
  { name: 'Парфюмерия', slug: 'parfyumeriya' },
  { name: 'Уход', slug: 'uhod' },
  { name: 'Декор', slug: 'dekor' }
];
for (const c of cats) {
  c.id = nextId(data, 'categories');
  data.categories.push(c);
}

// Товары
const products = [
  [1, 'Парфюмерная вода «Aurora»', 'Свежий цветочный аромат', 2890, 50, 1, '🌸'],
  [2, 'Крем для лица увлажняющий', 'Глубокое увлажнение 24 часа', 1450, 80, 0, '💧'],
  [3, 'Помада матовая «Ruby»', 'Стойкий матовый финиш', 890, 120, 0, '💄'],
  [2, 'Гель для душа «Citrus»', 'Бодрящий цитрусовый аромат', 620, 200, 0, '🍋'],
  [3, 'Тушь для ресниц объём', 'Максимальный объём без комочков', 980, 90, 1, '👁️'],
  [1, 'Парфюм «Midnight» 50 мл', 'Глубокий вечерний аромат', 3450, 30, 0, '🌙'],
  [2, 'Сыворотка с витамином C', 'Сияние и выравнивание тона', 2100, 60, 1, '✨'],
  [3, 'Тени для век палетка', '12 оттенков, шелковистая текстура', 1750, 45, 0, '🎨'],
];
for (const p of products) {
  data.products.push({
    id: nextId(data, 'products'),
    category_id: p[0],
    name: p[1],
    description: p[2],
    price: p[3],
    stock: p[4],
    is_new: p[5],
    is_active: 1,
    emoji: p[6]
  });
}

// Новости
const newsList = [
  ['Новый каталог осень-зима 2026', 'Встречайте коллекцию с тёплыми ароматами и насыщенными оттенками.', '2026-10-24'],
  ['Бонусная программа для Представителей', 'Начисление дополнительных баллов за заказы от 15 000 ₽.', '2026-10-18'],
  ['Открытие представительства в Казани', 'Теперь забрать заказ можно в удобном пункте выдачи.', '2026-10-10'],
  ['Обновление личного кабинета', 'Добавлена история операций по счёту и быстрый повтор заказа.', '2026-10-02'],
];
for (const n of newsList) {
  data.news.push({
    id: nextId(data, 'news'),
    title: n[0],
    content: n[1],
    published_at: n[2],
    is_published: 1
  });
}

// Демо-представитель
const hash = Buffer.from('1234').toString('base64');
data.representatives.push({
  id: nextId(data, 'representatives'),
  computer_number: 'R123456',
  password_hash: hash,
  full_name: 'Анна Смирнова',
  city: 'Москва',
  phone: '+7 (999) 123-45-67',
  email: 'anna@example.com',
  balance: 18750,
  created_at: '2026-08-01',
  is_active: 1
});

// Операции
const ops = [
  [1, 'deposit', 20000, 'Банковский перевод', '2026-09-10'],
  [1, 'order', -12400, 'Заказ ORD-77102', '2026-09-28'],
  [1, 'deposit', 15000, 'Банковский перевод', '2026-10-20'],
  [1, 'order', -8750, 'Заказ ORD-78421', '2026-10-15'],
];
for (const o of ops) {
  data.account_operations.push({
    id: nextId(data, 'account_operations'),
    representative_id: o[0],
    order_id: null,
    type: o[1],
    amount: o[2],
    description: o[3],
    created_at: o[4]
  });
}

// Заказы
const orders = [
  ['ORD-78421', 1, 8750, 'completed', '2026-10-15'],
  ['ORD-77102', 1, 12400, 'completed', '2026-09-28'],
  ['ORD-75988', 1, 4320, 'shipped', '2026-09-05'],
  ['ORD-74215', 1, 15680, 'completed', '2026-08-19'],
  ['ORD-73001', 1, 6100, 'completed', '2026-07-22'],
];
for (const o of orders) {
  data.orders.push({
    id: nextId(data, 'orders'),
    order_number: o[0],
    representative_id: o[1],
    total_amount: o[2],
    status: o[3],
    created_at: o[4]
  });
}

save(data);

console.log('');
console.log('✅ База данных создана!');
console.log('📁 Файл:', dbPath);
console.log('');
console.log('Демо-аккаунт:');
console.log('  Компьютерный номер: R123456');
console.log('  Пароль: 1234');
console.log('');
