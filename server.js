/**
 * БУРМАЛДЭНС — сервер без внешних зависимостей
 * Только встроенные модули Node.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { load, save, nextId } = require('./db');

const PORT = process.env.PORT || 3000;
// Сначала ищем index.html в корне (как на твоём GitHub), иначе в public/
const PUBLIC = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.join(__dirname, 'public');

function simpleHash(password) {
  return Buffer.from(String(password)).toString('base64');
}

function generateOrderNumber() {
  return 'ORD-' + Math.floor(10000 + Math.random() * 90000);
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleAPI(req, res, pathname) {
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // POST /api/register
  if (method === 'POST' && pathname === '/api/register') {
    const body = await readBody(req);
    const { computer_number, password, full_name, city, phone, email } = body;
    if (!computer_number || !password || !full_name) {
      return sendJSON(res, 400, { error: 'Заполните обязательные поля' });
    }
    if (!/^R\d{4,8}$/i.test(computer_number)) {
      return sendJSON(res, 400, { error: 'Номер должен быть в формате R123456' });
    }
    if (password.length < 4) {
      return sendJSON(res, 400, { error: 'Пароль слишком короткий' });
    }
    const data = load();
    const num = computer_number.toUpperCase();
    if (data.representatives.find(r => r.computer_number === num)) {
      return sendJSON(res, 400, { error: 'Такой компьютерный номер уже зарегистрирован' });
    }
    const user = {
      id: nextId(data, 'representatives'),
      computer_number: num,
      password_hash: simpleHash(password),
      full_name,
      city: city || null,
      phone: phone || null,
      email: email || null,
      balance: 0,
      created_at: new Date().toISOString().slice(0, 10),
      is_active: 1
    };
    data.representatives.push(user);
    save(data);
    const { password_hash, ...safe } = user;
    return sendJSON(res, 200, { success: true, user: safe });
  }

  // POST /api/login
  if (method === 'POST' && pathname === '/api/login') {
    const body = await readBody(req);
    const { computer_number, password } = body;
    if (!computer_number || !password) {
      return sendJSON(res, 400, { error: 'Введите номер и пароль' });
    }
    const data = load();
    const user = data.representatives.find(
      r => r.computer_number === computer_number.toUpperCase() && r.is_active
    );
    if (!user || user.password_hash !== simpleHash(password)) {
      return sendJSON(res, 401, { error: 'Неверный номер или пароль' });
    }
    const { password_hash, ...safe } = user;
    return sendJSON(res, 200, { success: true, user: safe });
  }

  // GET /api/me/:id
  const meMatch = pathname.match(/^\/api\/me\/(\d+)$/);
  if (method === 'GET' && meMatch) {
    const data = load();
    const user = data.representatives.find(r => r.id === Number(meMatch[1]) && r.is_active);
    if (!user) return sendJSON(res, 404, { error: 'Пользователь не найден' });
    const { password_hash, ...safe } = user;
    return sendJSON(res, 200, safe);
  }

  // PUT /api/me/:id
  if (method === 'PUT' && meMatch) {
    const body = await readBody(req);
    const data = load();
    const user = data.representatives.find(r => r.id === Number(meMatch[1]));
    if (!user) return sendJSON(res, 404, { error: 'Пользователь не найден' });
    user.full_name = body.full_name;
    user.city = body.city;
    user.phone = body.phone;
    user.email = body.email;
    save(data);
    const { password_hash, ...safe } = user;
    return sendJSON(res, 200, { success: true, user: safe });
  }

  // GET /api/products
  if (method === 'GET' && pathname === '/api/products') {
    const data = load();
    const products = data.products
      .filter(p => p.is_active)
      .map(p => {
        const cat = data.categories.find(c => c.id === p.category_id);
        return { ...p, category_name: cat ? cat.name : '' };
      })
      .sort((a, b) => (b.is_new - a.is_new) || (a.id - b.id));
    return sendJSON(res, 200, products);
  }

  // GET /api/news
  if (method === 'GET' && pathname === '/api/news') {
    const data = load();
    const news = data.news
      .filter(n => n.is_published)
      .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
      .slice(0, 10);
    return sendJSON(res, 200, news);
  }

  // GET /api/orders/:repId
  const ordersMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (method === 'GET' && ordersMatch) {
    const data = load();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const orders = data.orders
      .filter(o => o.representative_id === Number(ordersMatch[1]) && new Date(o.created_at) >= sixMonthsAgo)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return sendJSON(res, 200, orders);
  }

  // POST /api/orders
  if (method === 'POST' && pathname === '/api/orders') {
    const body = await readBody(req);
    const { representative_id, items } = body;
    if (!representative_id || !items || !items.length) {
      return sendJSON(res, 400, { error: 'Нет данных для заказа' });
    }
    const data = load();
    const rep = data.representatives.find(r => r.id === Number(representative_id));
    if (!rep) return sendJSON(res, 404, { error: 'Представитель не найден' });

    let total = 0;
    const orderItems = [];
    for (const item of items) {
      const product = data.products.find(p => p.id === item.product_id && p.is_active);
      if (!product) return sendJSON(res, 400, { error: `Товар #${item.product_id} не найден` });
      if (product.stock < item.quantity) {
        return sendJSON(res, 400, { error: `Недостаточно товара «${product.name}»` });
      }
      total += product.price * item.quantity;
      orderItems.push({ product, quantity: item.quantity });
    }
    if (rep.balance < total) {
      return sendJSON(res, 400, { error: `Недостаточно средств. Баланс: ${rep.balance} ₽, нужно: ${total} ₽` });
    }

    const orderNumber = generateOrderNumber();
    const orderId = nextId(data, 'orders');
    data.orders.push({
      id: orderId,
      order_number: orderNumber,
      representative_id: Number(representative_id),
      total_amount: total,
      status: 'completed',
      created_at: new Date().toISOString().slice(0, 10)
    });

    for (const oi of orderItems) {
      data.order_items.push({
        id: nextId(data, 'order_items'),
        order_id: orderId,
        product_id: oi.product.id,
        quantity: oi.quantity,
        price: oi.product.price
      });
      oi.product.stock -= oi.quantity;
    }

    rep.balance -= total;
    data.account_operations.push({
      id: nextId(data, 'account_operations'),
      representative_id: Number(representative_id),
      order_id: orderId,
      type: 'order',
      amount: -total,
      description: `Заказ ${orderNumber}`,
      created_at: new Date().toISOString().slice(0, 10)
    });

    save(data);
    return sendJSON(res, 200, {
      success: true,
      order_number: orderNumber,
      total,
      new_balance: rep.balance
    });
  }

  // GET /api/operations/:repId
  const opsMatch = pathname.match(/^\/api\/operations\/(\d+)$/);
  if (method === 'GET' && opsMatch) {
    const data = load();
    const ops = data.account_operations
      .filter(o => o.representative_id === Number(opsMatch[1]))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 50);
    return sendJSON(res, 200, ops);
  }

  // GET /api/debug/db — содержимое базы для демонстрации
  if (method === 'GET' && pathname === '/api/debug/db') {
    const data = load();
    return sendJSON(res, 200, data);
  }

  // GET /api/debug/db-view — удобная HTML-страница просмотра БД
  if (method === 'GET' && pathname === '/api/debug/db-view') {
    const data = load();
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>База данных — БУРМАЛДЭНС</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#f7f6fb; margin:0; padding:24px; color:#1e1520; }
    h1 { color:#261B2C; margin:0 0 8px; }
    .sub { color:#5a5460; margin-bottom:20px; }
    .card { background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,.08); padding:16px 20px; margin-bottom:16px; }
    h2 { font-size:1.1rem; color:#6661FB; margin:0 0 12px; }
    table { width:100%; border-collapse:collapse; font-size:0.9rem; }
    th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #e8e6f0; vertical-align:top; }
    th { background:#f7f6fb; color:#261B2C; }
    .btn { display:inline-block; margin:0 8px 16px 0; padding:10px 16px; background:#6661FB; color:#fff; text-decoration:none; border-radius:8px; border:none; cursor:pointer; font-size:0.95rem; }
    .btn:hover { background:#5550e0; }
    .btn-gray { background:#586790; }
    pre { background:#1e1520; color:#edd648; padding:12px; border-radius:8px; overflow:auto; font-size:0.8rem; max-height:320px; }
    .n { font-weight:700; color:#261B2C; }
  </style>
</head>
<body>
  <h1>База данных сервера</h1>
  <p class="sub">Файл <b>data/db.json</b> на Render. Обновите страницу после заказа или регистрации — данные изменятся.</p>
  <button class="btn" onclick="location.reload()">Обновить</button>
  <a class="btn btn-gray" href="/api/debug/db" target="_blank">Открыть сырой JSON</a>
  <a class="btn btn-gray" href="/">На сайт</a>

  <div class="card">
    <h2>Representatives (представители) — ${data.representatives.length}</h2>
    <table>
      <tr><th>ID</th><th>Номер</th><th>ФИО</th><th>Город</th><th>Баланс</th></tr>
      ${data.representatives.map(r => `<tr>
        <td>${r.id}</td><td>${r.computer_number}</td><td>${r.full_name}</td>
        <td>${r.city || ''}</td><td class="n">${Number(r.balance).toLocaleString('ru-RU')} ₽</td>
      </tr>`).join('') || '<tr><td colspan="5">Пусто</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>Orders (заказы) — ${data.orders.length}</h2>
    <table>
      <tr><th>Номер</th><th>ID предст.</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr>
      ${data.orders.map(o => `<tr>
        <td>${o.order_number}</td><td>${o.representative_id}</td>
        <td class="n">${Number(o.total_amount).toLocaleString('ru-RU')} ₽</td>
        <td>${o.status}</td><td>${o.created_at}</td>
      </tr>`).join('') || '<tr><td colspan="5">Пусто</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>Account operations (операции) — ${data.account_operations.length}</h2>
    <table>
      <tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Описание</th><th>ID предст.</th></tr>
      ${data.account_operations.map(o => `<tr>
        <td>${o.created_at}</td><td>${o.type}</td>
        <td class="n">${Number(o.amount).toLocaleString('ru-RU')} ₽</td>
        <td>${o.description || ''}</td><td>${o.representative_id}</td>
      </tr>`).join('') || '<tr><td colspan="5">Пусто</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>Products (товары) — ${data.products.length}</h2>
    <table>
      <tr><th>ID</th><th>Название</th><th>Цена</th><th>Остаток</th></tr>
      ${data.products.map(p => `<tr>
        <td>${p.id}</td><td>${p.name}</td>
        <td>${Number(p.price).toLocaleString('ru-RU')} ₽</td>
        <td>${p.stock}</td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="card">
    <h2>Полный JSON</h2>
    <pre>${JSON.stringify(data, null, 2).replace(/</g, '&lt;')}</pre>
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  sendJSON(res, 404, { error: 'API not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      return await handleAPI(req, res, pathname);
    }

    if (pathname === '/') pathname = '/index.html';
    const relative = pathname.replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC, relative);

    // защита от path traversal
    const publicResolved = path.resolve(PUBLIC);
    if (!filePath.startsWith(publicResolved + path.sep) && filePath !== publicResolved) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      console.log('404 file:', filePath);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found: ' + relative + '\nPUBLIC=' + PUBLIC);
    }

    sendFile(res, filePath);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: 'Ошибка сервера' });
  }
});

// Автосоздание БД при первом запуске (для Render)
try {
  const { dbPath } = require('./db');
  if (!fs.existsSync(dbPath)) {
    console.log('БД не найдена — создаём...');
    require('child_process').execSync('node init-db.js', { stdio: 'inherit' });
  }
} catch (e) {
  console.error('Не удалось инициализировать БД:', e.message);
}

console.log('__dirname =', __dirname);
console.log('PUBLIC    =', PUBLIC);
console.log('index.html exists =', fs.existsSync(path.join(PUBLIC, 'index.html')));
try {
  console.log('files in PUBLIC:', fs.readdirSync(PUBLIC).join(', '));
} catch (e) {
  console.error('Не могу прочитать public/:', e.message);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  БУРМАЛДЭНС — сервер запущен');
  console.log('  Порт: ' + PORT);
  console.log('══════════════════════════════════════════');
  console.log('Демо-вход: R123456 / 1234');
  console.log('');
});
