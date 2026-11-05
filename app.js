/* БУРМАЛДЭНС — фронтенд (работает с API) */

const API = ''; // тот же origin (localhost:3000)

// ========== ХРАНЕНИЕ СЕССИИ ==========
function getUser() {
  const raw = sessionStorage.getItem('burmaldens_user');
  return raw ? JSON.parse(raw) : null;
}

function setUser(user) {
  sessionStorage.setItem('burmaldens_user', JSON.stringify(user));
}

function logout() {
  sessionStorage.removeItem('burmaldens_user');
  window.location.href = '/index.html';
}

function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

// ========== API-ЗАПРОСЫ ==========
async function api(url, options = {}) {
  const res = await fetch(API + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

// ========== АВТОРИЗАЦИЯ ==========
async function handleLogin(e) {
  e.preventDefault();
  const num = document.getElementById('login-num').value.trim().toUpperCase();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  err.style.display = 'none';

  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ computer_number: num, password: pass })
    });
    setUser(data.user);
    window.location.href = '/cabinet.html';
  } catch (ex) {
    err.style.display = 'block';
    err.textContent = ex.message;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const err = document.getElementById('reg-error');
  const ok = document.getElementById('reg-success');
  err.style.display = 'none';
  ok.style.display = 'none';

  const body = {
    computer_number: document.getElementById('reg-num').value.trim().toUpperCase(),
    password: document.getElementById('reg-pass').value,
    full_name: document.getElementById('reg-name').value.trim(),
    city: document.getElementById('reg-city').value.trim(),
    phone: document.getElementById('reg-phone').value.trim(),
    email: document.getElementById('reg-email').value.trim()
  };

  const pass2 = document.getElementById('reg-pass2').value;
  if (body.password !== pass2) {
    err.style.display = 'block';
    err.textContent = 'Пароли не совпадают';
    return;
  }

  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    setUser(data.user);
    ok.style.display = 'block';
    ok.textContent = 'Регистрация успешна! Переход в кабинет…';
    setTimeout(() => window.location.href = '/cabinet.html', 1500);
  } catch (ex) {
    err.style.display = 'block';
    err.textContent = ex.message;
  }
}

// ========== РЕНДЕР ==========
function renderNews(containerId, newsList) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = newsList.map(n => {
    const d = new Date(n.published_at);
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    const month = months[d.getMonth()];
    return `
      <div class="news-item">
        <div class="news-date">
          <div class="day">${day}</div>
          <div class="month">${month}</div>
        </div>
        <div class="news-content">
          <h3>${n.title}</h3>
          <p>${n.content || ''}</p>
        </div>
      </div>`;
  }).join('');
}

function renderProducts(containerId, products) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = products.map(p => `
    <div class="card">
      <div class="card-img">${p.emoji || '📦'}</div>
      <div class="card-body">
        ${p.is_new ? '<span class="badge">Новинка</span>' : ''}
        <h3>${p.name}</h3>
        <p>${p.category_name || ''}</p>
        <div class="price">${Number(p.price).toLocaleString('ru-RU')} ₽</div>
      </div>
    </div>
  `).join('');
}

// ========== КАБИНЕТ ==========
let cart = {};
let allProducts = [];

function switchSection(id) {
  document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const panel = document.getElementById('sec-' + id);
  if (panel) panel.classList.add('active');
  const link = document.querySelector(`.sidebar-nav a[data-sec="${id}"]`);
  if (link) link.classList.add('active');

  const titles = {
    home: 'Главная', order: 'Разместить заказ', history: 'История заказов',
    profile: 'Персональные данные', balance: 'Баланс и операции'
  };
  const h = document.getElementById('cabinet-title');
  if (h) h.textContent = titles[id] || 'Кабинет';
}

async function initCabinet() {
  const user = requireAuth();
  if (!user) return;

  // Обновляем данные с сервера
  try {
    const fresh = await api('/api/me/' + user.id);
    setUser(fresh);
    updateUserUI(fresh);
  } catch {
    updateUserUI(user);
  }

  // Товары и новости
  try {
    allProducts = await api('/api/products');
    renderOrderProducts(allProducts);
  } catch (e) { console.error(e); }

  try {
    const news = await api('/api/news');
    renderNews('news-list', news.slice(0, 3));
  } catch (e) { console.error(e); }

  await loadOrderHistory();
  await loadOperations();

  switchSection('home');
}

function updateUserUI(user) {
  const nameEl = document.getElementById('side-name');
  const idEl = document.getElementById('side-id');
  if (nameEl) nameEl.textContent = user.full_name;
  if (idEl) idEl.textContent = user.computer_number;

  const bal = Number(user.balance).toLocaleString('ru-RU') + ' ₽';
  ['bal-amount', 'bal-amount-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = bal;
  });

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('prof-name', user.full_name);
  set('prof-city', user.city);
  set('prof-phone', user.phone);
  set('prof-email', user.email);
  set('prof-num', user.computer_number);
}

function renderOrderProducts(products) {
  const el = document.getElementById('order-products');
  if (!el) return;
  el.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="card-img">${p.emoji || '📦'}</div>
      <div class="card-body">
        ${p.is_new ? '<span class="badge">Новинка</span>' : '<span style="height:22px;display:block"></span>'}
        <h3>${p.name}</h3>
        <p style="margin-bottom:8px">${p.category_name || ''}</p>
        <div class="price" style="margin-bottom:12px">${Number(p.price).toLocaleString('ru-RU')} ₽</div>
        <div class="actions">
          <input type="number" class="qty-input" id="qty-${p.id}" value="1" min="1" max="99">
          <button class="btn btn-primary btn-sm" onclick="addToCart(${p.id})">В корзину</button>
        </div>
      </div>
    </div>
  `).join('');
}

function addToCart(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const qty = parseInt(document.getElementById('qty-' + id).value) || 1;
  if (!cart[id]) cart[id] = { ...p, qty: 0 };
  cart[id].qty += qty;
  updateCartUI();
}

function removeFromCart(id) {
  delete cart[id];
  updateCartUI();
}

function decreaseCartQty(id) {
  if (!cart[id]) return;
  cart[id].qty -= 1;
  if (cart[id].qty <= 0) delete cart[id];
  updateCartUI();
}

function updateCartUI() {
  const el = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  if (!el) return;

  const items = Object.values(cart);
  if (!items.length) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Корзина пуста</p>';
    totalEl.textContent = '0 ₽';
    return;
  }

  el.innerHTML = items.map(i => `
    <div class="cart-item" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="flex:1;min-width:120px">${i.name} × ${i.qty}</span>
      <span style="white-space:nowrap">${(i.price * i.qty).toLocaleString('ru-RU')} ₽</span>
      <span style="display:flex;gap:4px">
        <button type="button" class="btn btn-sm" style="padding:4px 8px;background:#e8e6f0;color:var(--plum)" onclick="decreaseCartQty(${i.id})" title="Уменьшить">−</button>
        <button type="button" class="btn btn-sm" style="padding:4px 8px;background:#fde8e8;color:#c53030" onclick="removeFromCart(${i.id})" title="Убрать из корзины">✕</button>
      </span>
    </div>
  `).join('');

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  totalEl.textContent = total.toLocaleString('ru-RU') + ' ₽';
}

async function placeOrder() {
  const user = getUser();
  const items = Object.values(cart);
  if (!items.length) return alert('Корзина пуста');

  try {
    const data = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        representative_id: user.id,
        items: items.map(i => ({ product_id: i.id, quantity: i.qty }))
      })
    });

    cart = {};
    updateCartUI();

    user.balance = data.new_balance;
    setUser(user);
    updateUserUI(user);

    alert(`Заказ ${data.order_number} успешно оформлен на сумму ${data.total.toLocaleString('ru-RU')} ₽`);
    await loadOrderHistory();
    await loadOperations();
  } catch (ex) {
    alert(ex.message);
  }
}

async function loadOrderHistory() {
  const user = getUser();
  if (!user) return;
  try {
    const orders = await api('/api/orders/' + user.id);
    const el = document.getElementById('history-table');
    if (!el) return;
    el.innerHTML = orders.map(o => `
      <tr>
        <td><strong>${o.order_number}</strong></td>
        <td>${formatDate(o.created_at)}</td>
        <td>—</td>
        <td>${Number(o.total_amount).toLocaleString('ru-RU')} ₽</td>
        <td><span class="status ${o.status === 'completed' ? 'status-done' : 'status-shipped'}">${
          o.status === 'completed' ? 'Выполнен' : o.status === 'shipped' ? 'Отправлен' : o.status
        }</span></td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

async function loadOperations() {
  const user = getUser();
  if (!user) return;
  try {
    const ops = await api('/api/operations/' + user.id);
    const el = document.getElementById('ops-table');
    if (!el) return;
    el.innerHTML = ops.map(o => `
      <tr>
        <td>${formatDate(o.created_at)}</td>
        <td>${o.type === 'deposit' ? 'Пополнение' : o.type === 'order' ? 'Списание' : o.type}</td>
        <td>${o.description || ''}</td>
        <td style="color:${o.amount > 0 ? '#276749' : '#c53030'};font-weight:600">
          ${o.amount > 0 ? '+' : ''}${Number(o.amount).toLocaleString('ru-RU')} ₽
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

async function depositBalance() {
  const user = getUser();
  if (!user) return;
  const amount = Number(document.getElementById('deposit-amount').value);
  if (!amount || amount <= 0) {
    alert('Введите сумму больше 0');
    return;
  }
  try {
    const data = await api('/api/deposit', {
      method: 'POST',
      body: JSON.stringify({
        representative_id: user.id,
        amount,
        description: 'Пополнение счёта (демо)'
      })
    });
    user.balance = data.new_balance;
    setUser(user);
    updateUserUI(user);
    await loadOperations();
    alert('Счёт пополнен на ' + amount.toLocaleString('ru-RU') + ' ₽\nНовый баланс: ' + Number(data.new_balance).toLocaleString('ru-RU') + ' ₽');
  } catch (ex) {
    alert(ex.message);
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const user = getUser();
  try {
    const data = await api('/api/me/' + user.id, {
      method: 'PUT',
      body: JSON.stringify({
        full_name: document.getElementById('prof-name').value.trim(),
        city: document.getElementById('prof-city').value.trim(),
        phone: document.getElementById('prof-phone').value.trim(),
        email: document.getElementById('prof-email').value.trim()
      })
    });
    setUser(data.user);
    updateUserUI(data.user);
    const msg = document.getElementById('prof-success');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2500);
  } catch (ex) {
    alert(ex.message);
  }
}

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
  // Главная страница
  if (document.getElementById('novelties')) {
    try {
      const products = await api('/api/products');
      renderProducts('novelties', products.filter(p => p.is_new).concat(products).slice(0, 8));
    } catch (e) { console.error(e); }
  }
  if (document.getElementById('news-list') && !document.body.classList.contains('cabinet-page')) {
    try {
      const news = await api('/api/news');
      renderNews('news-list', news);
    } catch (e) { console.error(e); }
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const regForm = document.getElementById('reg-form');
  if (regForm) regForm.addEventListener('submit', handleRegister);

  const profForm = document.getElementById('prof-form');
  if (profForm) profForm.addEventListener('submit', saveProfile);

  if (document.body.classList.contains('cabinet-page')) {
    initCabinet();
  }
});
