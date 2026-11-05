const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'db.json');

const defaultData = {
  representatives: [],
  categories: [],
  products: [],
  orders: [],
  order_items: [],
  account_operations: [],
  news: [],
  _seq: { representatives: 0, categories: 0, products: 0, orders: 0, order_items: 0, account_operations: 0, news: 0 }
};

function load() {
  if (!fs.existsSync(dbPath)) return JSON.parse(JSON.stringify(defaultData));
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function save(data) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function nextId(data, table) {
  data._seq[table] = (data._seq[table] || 0) + 1;
  return data._seq[table];
}

module.exports = { load, save, nextId, dbPath };
