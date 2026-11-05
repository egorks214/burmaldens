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
const PUBLIC = path.join(__dirname, 'public');

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
