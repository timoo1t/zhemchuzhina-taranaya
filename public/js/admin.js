const state = {
  houses: [],
  blocked: [],
  reviews: [],
  bookings: [],
  bookingsFilter: 'all',
  settings: {},
  calendarMonth: (() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  })(),
};

const el = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* Boot: check auth */

async function boot() {
  console.log('[admin] boot start');
  try {
    const status = await api('/api/admin/status');
    console.log('[admin] status =', status);
    el('admin-boot').hidden = true;
    if (!status.configured) {
      console.warn('[admin] ADMIN_PASSWORD not set on server');
      showLogin();
      el('admin-login-hint').hidden = false;
      return;
    }
    if (status.authenticated) {
      console.log('[admin] already authenticated -> showApp');
      showApp();
    } else {
      console.log('[admin] not authenticated -> showLogin');
      showLogin();
    }
  } catch (err) {
    console.error('[admin] boot error:', err);
    el('admin-boot').textContent = 'Ошибка загрузки: ' + err.message;
  }
}

function showLogin() {
  el('admin-login').hidden = false;
  el('admin-app').hidden = true;
}

function showApp() {
  el('admin-login').hidden = true;
  el('admin-app').hidden = false;
  loadAll().catch((err) => {
    console.error('loadAll failed:', err);
    alert('Ошибка загрузки данных админки: ' + err.message);
  });
}

el('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log('[admin] login submit');
  const password = e.target.password.value;
  const errEl = el('admin-login-error');
  errEl.hidden = true;
  try {
    const res = await api('/api/admin/login', { method: 'POST', body: { password } });
    console.log('[admin] login success:', res);
    showApp();
  } catch (err) {
    console.error('[admin] login failed:', err);
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
});

el('admin-logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  showLogin();
});

/* Tabs */

document.querySelectorAll('.admin-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach((el) => el.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.querySelectorAll('[data-panel]').forEach((p) => {
      p.hidden = p.dataset.panel !== btn.dataset.tab;
    });
  });
});

/* Load all data */

async function loadAll() {
  const [housesRes, blockedRes, reviewsRes, bookingsRes, settingsRes] = await Promise.all([
    api('/api/houses'),
    api('/api/admin/blocked-dates'),
    api('/api/admin/reviews'),
    api('/api/admin/bookings'),
    api('/api/admin/settings'),
  ]);
  state.houses = housesRes.houses || [];
  state.blocked = blockedRes.ranges || [];
  state.reviews = reviewsRes.reviews || [];
  state.bookings = bookingsRes.bookings || [];
  state.settings = settingsRes.settings || {};

  populateHouseSelects();
  renderHouses();
  renderBlocked();
  renderReviews();
  renderBookings();
  renderSettings();
  renderCalendar();
}

/* Bookings */

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDateRu(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS_GEN[m - 1]} ${y}`;
}

function formatDateTimeRu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(n || 0);
}

function nightsBetween(from, to) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

const STATUS_LABELS = {
  paid: 'Оплачено',
  pending: 'Ожидает оплаты',
  cancelled: 'Отменена',
  expired: 'Просрочена',
};

function renderStats() {
  const wrap = el('admin-stats');
  if (!wrap) return;
  const paid = state.bookings.filter((b) => b.status === 'paid');
  const pending = state.bookings.filter((b) => b.status === 'pending');
  const cancelled = state.bookings.filter((b) => b.status === 'cancelled');
  const expired = state.bookings.filter((b) => b.status === 'expired');

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthRevenue = paid
    .filter((b) => (b.paidAt || b.createdAt || '').startsWith(monthKey))
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalRevenue = paid.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const today = now.toISOString().slice(0, 10);
  const upcoming = paid.filter((b) => b.checkIn && b.checkIn >= today).length;

  wrap.innerHTML = `
    <div class="admin-stat">
      <span class="admin-stat__key">Доход за ${monthKey}</span>
      <span class="admin-stat__val">${formatPrice(monthRevenue)} ₽</span>
    </div>
    <div class="admin-stat">
      <span class="admin-stat__key">Доход всего</span>
      <span class="admin-stat__val">${formatPrice(totalRevenue)} ₽</span>
    </div>
    <div class="admin-stat">
      <span class="admin-stat__key">Оплачено · Ждёт · Просрочено · Отменено</span>
      <span class="admin-stat__val">${paid.length} · ${pending.length} · ${expired.length} · ${cancelled.length}</span>
    </div>
    <div class="admin-stat">
      <span class="admin-stat__key">Предстоящих заездов</span>
      <span class="admin-stat__val">${upcoming}</span>
    </div>
  `;
}

function renderBookings() {
  renderStats();

  const wrap = el('admin-bookings-list');
  const countEl = el('bookings-count');
  const filter = state.bookingsFilter;

  const filtered = filter === 'all'
    ? state.bookings
    : state.bookings.filter((b) => b.status === filter);

  countEl.textContent = `${filtered.length} из ${state.bookings.length}`;

  if (!filtered.length) {
    wrap.innerHTML = '<p class="admin-empty">Броней с таким статусом пока нет.</p>';
    return;
  }

  wrap.innerHTML = filtered.map((b) => {
    const status = b.status || 'pending';
    const nights = nightsBetween(b.checkIn, b.checkOut);
    const statusLabel = STATUS_LABELS[status] || status;
    const actions = [];
    if (status === 'pending' || status === 'expired') actions.push(`<button type="button" class="admin-link" data-action="mark-paid" data-id="${escapeHtml(b.id)}">Отметить оплаченной</button>`);
    if (status !== 'cancelled' && status !== 'expired') actions.push(`<button type="button" class="admin-link" data-action="cancel" data-id="${escapeHtml(b.id)}">Отменить</button>`);
    actions.push(`<button type="button" class="admin-link admin-link--danger" data-action="delete" data-id="${escapeHtml(b.id)}">Удалить</button>`);

    return `
    <article class="booking-card booking-card--${escapeHtml(status)}">
      <header class="booking-card__head">
        <div>
          <span class="booking-card__id">${escapeHtml(b.id)}</span>
          <h4 class="booking-card__title">${escapeHtml(houseLabelByNum(b.houseNumber))}</h4>
        </div>
        <span class="booking-card__status booking-card__status--${escapeHtml(status)}">${statusLabel}</span>
      </header>

      <div class="booking-card__grid">
        <div class="booking-card__cell">
          <span class="booking-card__key">Гость</span>
          <span class="booking-card__val">${escapeHtml(b.guestName || '—')}</span>
          <span class="booking-card__sub">${escapeHtml(b.guestPhone || '')}</span>
          <span class="booking-card__sub">${escapeHtml(b.guestEmail || '')}</span>
        </div>
        <div class="booking-card__cell">
          <span class="booking-card__key">Заезд → Выезд</span>
          <span class="booking-card__val">${formatDateRu(b.checkIn)} → ${formatDateRu(b.checkOut)}</span>
          <span class="booking-card__sub">${nights} ноч. · ${b.guests || 1} гост.</span>
        </div>
        <div class="booking-card__cell">
          <span class="booking-card__key">Сумма</span>
          <span class="booking-card__val booking-card__val--amount">${formatPrice(b.amount)} ₽</span>
          ${status === 'paid' && b.paidAt ? `<span class="booking-card__sub">Оплата: ${formatDateTimeRu(b.paidAt)}</span>` : ''}
          ${status === 'cancelled' && b.cancelledAt ? `<span class="booking-card__sub">Отменена: ${formatDateTimeRu(b.cancelledAt)}</span>` : ''}
          ${status === 'expired' && b.expiredAt ? `<span class="booking-card__sub">Просрочена: ${formatDateTimeRu(b.expiredAt)}</span>` : ''}
        </div>
      </div>

      ${b.note ? `<div class="booking-card__note">${escapeHtml(b.note)}</div>` : ''}

      <footer class="booking-card__foot">
        <span>Создана: ${formatDateTimeRu(b.createdAt)}</span>
        ${b.paymentId ? `<span>Платёж: ${escapeHtml(b.paymentId)}</span>` : ''}
        <div class="booking-card__actions">${actions.join('')}</div>
      </footer>
    </article>
    `;
  }).join('');

  wrap.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleBookingAction(btn.dataset.action, btn.dataset.id));
  });
}

async function handleBookingAction(action, id) {
  try {
    if (action === 'mark-paid') {
      if (!confirm('Отметить бронь как оплаченную? Даты будут заблокированы.')) return;
      const res = await api(`/api/admin/bookings/${id}/mark-paid`, { method: 'POST' });
      replaceBooking(id, res.booking);
    } else if (action === 'cancel') {
      if (!confirm('Отменить эту бронь?')) return;
      const res = await api(`/api/admin/bookings/${id}/cancel`, { method: 'POST' });
      replaceBooking(id, res.booking);
    } else if (action === 'delete') {
      if (!confirm('Удалить бронь без возможности восстановления?')) return;
      await api(`/api/admin/bookings/${id}`, { method: 'DELETE' });
      state.bookings = state.bookings.filter((b) => b.id !== id);
    }
    renderBookings();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

function replaceBooking(id, updated) {
  const idx = state.bookings.findIndex((b) => b.id === id);
  if (idx !== -1) state.bookings[idx] = updated;
}

document.getElementById('bookings-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('.bookings-filter__btn');
  if (!btn) return;
  state.bookingsFilter = btn.dataset.status;
  document.querySelectorAll('.bookings-filter__btn').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  renderBookings();
});

el('offline-booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const status = el('offline-status');
  status.textContent = 'Создаём…';
  const payload = {
    houseNumber: Number(f.houseNumber.value),
    checkIn: f.checkIn.value,
    checkOut: f.checkOut.value,
    guests: Number(f.guests.value) || 1,
    guestName: f.guestName.value.trim(),
    guestPhone: f.guestPhone.value.trim(),
    guestEmail: f.guestEmail.value.trim(),
    amount: f.amount.value ? Number(f.amount.value) : undefined,
    note: f.note.value.trim(),
  };
  try {
    const res = await api('/api/admin/bookings', { method: 'POST', body: payload });
    state.bookings.unshift(res.booking);
    status.textContent = 'Создано';
    setTimeout(() => { status.textContent = ''; }, 2500);
    f.reset();
    f.guests.value = 2;
    el('offline-booking-details').open = false;
    renderBookings();
  } catch (err) {
    status.textContent = 'Ошибка: ' + err.message;
  }
});

function populateHouseSelects() {
  const options = state.houses
    .map((h) => `<option value="${h.num}">${escapeHtml(houseDisplayName(h))}</option>`)
    .join('');
  el('blocked-house').innerHTML = options;
  el('review-house').innerHTML = '<option value="">—</option>' + options;
  const offlineHouse = el('offline-house');
  if (offlineHouse) offlineHouse.innerHTML = options;
}

function houseLabelByNum(num) {
  const h = state.houses.find((x) => Number(x.num) === Number(num));
  return h ? houseDisplayName(h) : `№ ${num}`;
}

/* Houses */

const TYPE_LABELS = { cabin: 'Домик', room: 'Гостевой номер', whole: 'Вся база' };

function photoTileHtml(houseNum, url, index) {
  return `<div class="photo-tile" draggable="true" data-photo-url="${escapeHtml(url)}">
    <img src="${escapeHtml(url)}" alt="Фото ${index + 1}" loading="lazy">
    ${index === 0 ? '<span class="photo-tile__badge">Обложка</span>' : ''}
    <button type="button" class="photo-tile__del" data-photo-delete title="Удалить">×</button>
  </div>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function houseDisplayName(h) {
  if (h.title) return h.title;
  if (h.type === 'room') return `Гостевой номер № ${h.num}`;
  if (h.type === 'whole') return 'Аренда всей базы';
  return `Домик № ${h.num}`;
}

function renderHouses() {
  const wrap = el('admin-houses');
  wrap.innerHTML = state.houses.map((h) => {
    const type = h.type || 'cabin';
    const typeOptions = ['cabin', 'room', 'whole']
      .map((v) => `<option value="${v}"${v === type ? ' selected' : ''}>${TYPE_LABELS[v]}</option>`)
      .join('');
    return `
    <details class="admin-house" data-num="${h.num}">
      <summary>
        <span class="admin-house__name">${escapeHtml(houseDisplayName(h))}</span>
        <span class="admin-house__meta">${formatPrice(h.pricePerNight)} ₽/ночь · до ${h.guests} · ${escapeHtml(h.beds)}</span>
      </summary>
      <form class="admin-house__form" data-house-form="${h.num}">
        <div class="admin-form__row">
          <label class="booking-form__field">
            <span>Тип</span>
            <select name="type">${typeOptions}</select>
          </label>
          <label class="booking-form__field">
            <span>Цена за ночь, ₽</span>
            <input type="number" name="pricePerNight" min="0" step="100" value="${h.pricePerNight || 0}">
          </label>
          <label class="booking-form__field">
            <span>Гостей</span>
            <input type="number" name="guests" min="1" max="40" value="${h.guests}">
          </label>
          <label class="booking-form__field">
            <span>Спальни</span>
            <input type="text" name="beds" value="${escapeHtml(h.beds)}">
          </label>
        </div>
        <label class="booking-form__field">
          <span>Заголовок (необязательно — если пусто, используется «Домик № N»)</span>
          <input type="text" name="title" value="${escapeHtml(h.title || '')}" placeholder="Например: Гостевой номер № 1">
        </label>
        <label class="booking-form__field">
          <span>Теги (через запятую)</span>
          <input type="text" name="tags" value="${escapeHtml((h.tags || []).join(', '))}">
        </label>
        <div class="booking-form__field photo-manager" data-photo-manager="${h.num}">
          <span>Фото (первая — обложка. Перетащите файлы сюда или используйте drag внутри списка для сортировки)</span>
          <div class="photo-manager__grid" data-photo-grid="${h.num}">
            ${(h.imgs || []).map((u, i) => photoTileHtml(h.num, u, i)).join('')}
          </div>
          <label class="photo-manager__drop" data-photo-drop="${h.num}">
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-photo-input="${h.num}">
            <span class="photo-manager__drop-text">Перетащите фото сюда или <u>выберите файлы</u></span>
            <span class="photo-manager__drop-hint">JPEG · PNG · WebP · до 15 МБ каждое</span>
          </label>
          <span class="photo-manager__status" data-photo-status="${h.num}"></span>
        </div>
        <label class="booking-form__field">
          <span>Описание</span>
          <textarea name="description" rows="5">${escapeHtml(h.description || '')}</textarea>
        </label>
        <label class="booking-form__field">
          <span>Что в домике (один пункт на строку)</span>
          <textarea name="amenities" rows="4" placeholder="Кухня с плитой&#10;Wi-Fi&#10;Стиральная машина">${escapeHtml((h.amenities || []).join('\n'))}</textarea>
        </label>
        <div class="admin-form__actions">
          <button type="submit" class="btn">Сохранить</button>
          <span class="admin-form__status" data-status="${h.num}"></span>
        </div>
      </form>
    </details>
  `;
  }).join('');

  wrap.querySelectorAll('[data-photo-manager]').forEach((mgr) => bindPhotoManager(mgr));

  wrap.querySelectorAll('form[data-house-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const num = form.dataset.houseForm;
      const status = wrap.querySelector(`[data-status="${num}"]`);
      status.textContent = 'Сохраняем…';
      const payload = {
        type: form.type.value,
        title: form.title.value.trim(),
        pricePerNight: Number(form.pricePerNight.value) || 0,
        guests: Number(form.guests.value),
        beds: form.beds.value.trim(),
        tags: form.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
        description: form.description.value.trim(),
        amenities: form.amenities.value.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      };
      try {
        const res = await api(`/api/admin/houses/${num}`, { method: 'PUT', body: payload });
        const idx = state.houses.findIndex((h) => Number(h.num) === Number(num));
        if (idx !== -1) state.houses[idx] = res.house;
        status.textContent = 'Сохранено';
        setTimeout(() => { status.textContent = ''; }, 2500);
      } catch (err) {
        status.textContent = 'Ошибка: ' + err.message;
      }
    });
  });
}

function bindPhotoManager(mgr) {
  const num = mgr.dataset.photoManager;
  const grid = mgr.querySelector(`[data-photo-grid="${num}"]`);
  const drop = mgr.querySelector(`[data-photo-drop="${num}"]`);
  const input = mgr.querySelector(`[data-photo-input="${num}"]`);
  const status = mgr.querySelector(`[data-photo-status="${num}"]`);

  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle('is-error', isError);
    if (msg && !isError) setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, 3000);
  };

  input.addEventListener('change', () => uploadFiles([...input.files]));

  drop.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    drop.classList.add('is-dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
  drop.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    drop.classList.remove('is-dragover');
    uploadFiles([...e.dataTransfer.files]);
  });

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-photo-delete]');
    if (!btn) return;
    if (!confirm('Удалить это фото?')) return;
    const url = btn.closest('.photo-tile').dataset.photoUrl;
    try {
      const res = await api(`/api/admin/houses/${num}/photos`, { method: 'DELETE', body: { url } });
      updateHouseInState(num, res.house);
      refreshGrid();
      setStatus('Удалено');
    } catch (err) {
      setStatus('Ошибка: ' + err.message, true);
    }
  });

  let dragUrl = null;
  grid.addEventListener('dragstart', (e) => {
    const tile = e.target.closest('.photo-tile');
    if (!tile) return;
    dragUrl = tile.dataset.photoUrl;
    tile.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  grid.addEventListener('dragend', () => {
    grid.querySelectorAll('.is-dragging, .is-drop-target').forEach((el) => el.classList.remove('is-dragging', 'is-drop-target'));
    dragUrl = null;
  });
  grid.addEventListener('dragover', (e) => {
    if (!dragUrl) return;
    e.preventDefault();
    const tile = e.target.closest('.photo-tile');
    grid.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    if (tile && tile.dataset.photoUrl !== dragUrl) tile.classList.add('is-drop-target');
  });
  grid.addEventListener('drop', async (e) => {
    if (!dragUrl) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target.closest('.photo-tile');
    if (!target || target.dataset.photoUrl === dragUrl) return;

    const house = state.houses.find((h) => Number(h.num) === Number(num));
    const imgs = (house?.imgs || []).slice();
    const from = imgs.indexOf(dragUrl);
    const to = imgs.indexOf(target.dataset.photoUrl);
    if (from < 0 || to < 0) return;
    imgs.splice(from, 1);
    imgs.splice(to, 0, dragUrl);

    try {
      const res = await api(`/api/admin/houses/${num}/photos/reorder`, { method: 'PUT', body: { imgs } });
      updateHouseInState(num, res.house);
      refreshGrid();
      setStatus('Порядок сохранён');
    } catch (err) {
      setStatus('Ошибка: ' + err.message, true);
    }
  });

  async function uploadFiles(files) {
    if (!files.length) return;
    setStatus(`Загружаем ${files.length}…`);
    try {
      const payload = { files: [] };
      for (const f of files) {
        if (!f.type.startsWith('image/')) throw new Error(`${f.name}: не изображение`);
        const dataUrl = await readFileAsDataUrl(f);
        payload.files.push({ name: f.name, dataUrl });
      }
      const res = await api(`/api/admin/houses/${num}/photos`, { method: 'POST', body: payload });
      updateHouseInState(num, res.house);
      refreshGrid();
      setStatus(`Добавлено: ${files.length}`);
      input.value = '';
    } catch (err) {
      setStatus('Ошибка: ' + err.message, true);
    }
  }

  function refreshGrid() {
    const house = state.houses.find((h) => Number(h.num) === Number(num));
    const imgs = house?.imgs || [];
    grid.innerHTML = imgs.map((u, i) => photoTileHtml(num, u, i)).join('');
  }
}

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

function updateHouseInState(num, house) {
  const idx = state.houses.findIndex((h) => Number(h.num) === Number(num));
  if (idx !== -1) state.houses[idx] = house;
}

/* Blocked dates */

function renderBlocked() {
  const wrap = el('admin-blocked-list');
  if (!state.blocked.length) {
    wrap.innerHTML = '<p class="admin-empty">Пока нет вручную заблокированных диапазонов.</p>';
    return;
  }
  const byHouse = new Map();
  for (const r of state.blocked) {
    if (!byHouse.has(r.houseNum)) byHouse.set(r.houseNum, []);
    byHouse.get(r.houseNum).push(r);
  }
  wrap.innerHTML = [...byHouse.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, ranges]) => `
      <div class="admin-blocked-group">
        <h4>${escapeHtml(houseLabelByNum(num))}</h4>
        <ul>
          ${ranges.map((r) => `
            <li>
              <span class="admin-blocked-dates">${r.from} → ${r.to}</span>
              ${r.reason ? `<span class="admin-blocked-reason">${escapeHtml(r.reason)}</span>` : ''}
              <button type="button" class="admin-link admin-link--danger" data-delete-blocked="${r.id}">Удалить</button>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');

  wrap.querySelectorAll('[data-delete-blocked]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить этот диапазон?')) return;
      const id = btn.dataset.deleteBlocked;
      try {
        await api(`/api/admin/blocked-dates/${id}`, { method: 'DELETE' });
        state.blocked = state.blocked.filter((r) => r.id !== id);
        renderBlocked();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  });
}

el('blocked-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    houseNum: Number(f.houseNum.value),
    from: f.from.value,
    to: f.to.value,
    reason: f.reason.value.trim(),
  };
  try {
    const res = await api('/api/admin/blocked-dates', { method: 'POST', body: payload });
    state.blocked.push(res.range);
    renderBlocked();
    f.reset();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
});

/* Reviews */

function renderReviews() {
  const wrap = el('admin-reviews-list');
  if (!state.reviews.length) {
    wrap.innerHTML = '<p class="admin-empty">Отзывов пока нет.</p>';
    return;
  }
  wrap.innerHTML = state.reviews
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((r) => `
      <article class="admin-review">
        <header>
          <strong>${escapeHtml(r.author)}</strong>
          <span class="admin-review__meta">${r.date} · ${r.rating}/5${r.houseNum ? ` · ${escapeHtml(houseLabelByNum(r.houseNum))}` : ''}</span>
        </header>
        <p>${escapeHtml(r.text)}</p>
        <footer>
          <button type="button" class="admin-link" data-edit-review="${r.id}">Редактировать</button>
          <button type="button" class="admin-link admin-link--danger" data-delete-review="${r.id}">Удалить</button>
        </footer>
      </article>
    `).join('');

  wrap.querySelectorAll('[data-delete-review]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить отзыв?')) return;
      const id = btn.dataset.deleteReview;
      try {
        await api(`/api/admin/reviews/${id}`, { method: 'DELETE' });
        state.reviews = state.reviews.filter((r) => r.id !== id);
        renderReviews();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  });

  wrap.querySelectorAll('[data-edit-review]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editReview;
      const review = state.reviews.find((r) => r.id === id);
      if (!review) return;
      const f = el('review-form');
      f.id.value = review.id;
      f.author.value = review.author;
      f.houseNum.value = review.houseNum || '';
      f.date.value = review.date;
      f.rating.value = review.rating;
      f.text.value = review.text;
      el('review-submit').textContent = 'Сохранить';
      el('review-cancel').hidden = false;
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function resetReviewForm() {
  const f = el('review-form');
  f.reset();
  f.id.value = '';
  el('review-submit').textContent = 'Добавить отзыв';
  el('review-cancel').hidden = true;
}

el('review-cancel').addEventListener('click', resetReviewForm);

el('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    author: f.author.value.trim(),
    houseNum: f.houseNum.value ? Number(f.houseNum.value) : null,
    date: f.date.value || null,
    rating: Number(f.rating.value),
    text: f.text.value.trim(),
  };
  try {
    if (f.id.value) {
      const res = await api(`/api/admin/reviews/${f.id.value}`, { method: 'PUT', body: payload });
      const idx = state.reviews.findIndex((r) => r.id === f.id.value);
      if (idx !== -1) state.reviews[idx] = res.review;
    } else {
      const res = await api('/api/admin/reviews', { method: 'POST', body: payload });
      state.reviews.push(res.review);
    }
    resetReviewForm();
    renderReviews();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
});

/* Calendar */

const RU_MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function computeCalendarStates(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) dates.push(isoDate(year, month, d));

  const active = state.bookings.filter((b) => b.status === 'paid' || b.status === 'pending');
  const cells = new Map();

  for (const h of state.houses) {
    for (const iso of dates) {
      const b = active.find((x) =>
        Number(x.houseNumber) === Number(h.num) && x.checkIn <= iso && iso < x.checkOut
      );
      if (b) {
        cells.set(`${h.num}|${iso}`, { state: b.status === 'paid' ? 'paid' : 'hold', label: `${STATUS_LABELS[b.status]}: ${b.guestName || b.id}` });
        continue;
      }
      const m = state.blocked.find((r) =>
        Number(r.houseNum) === Number(h.num) && r.from <= iso && iso < r.to
      );
      if (m) {
        cells.set(`${h.num}|${iso}`, { state: 'manual', label: m.reason || 'Ручной блок' });
      }
    }
  }

  const whole = state.houses.find((h) => h.type === 'whole');
  const parts = state.houses.filter((h) => h.type === 'cabin' || h.type === 'room');
  if (whole) {
    for (const iso of dates) {
      const wholeKey = `${whole.num}|${iso}`;
      if (cells.has(wholeKey)) {
        for (const p of parts) {
          const key = `${p.num}|${iso}`;
          if (!cells.has(key)) cells.set(key, { state: 'cross', label: 'Занято через «Аренда всей базы»' });
        }
      } else {
        const source = parts.find((p) => cells.has(`${p.num}|${iso}`));
        if (source) cells.set(wholeKey, { state: 'cross', label: `Занято через ${houseDisplayName(source)}` });
      }
    }
  }

  return { dates, cells };
}

function renderCalendar() {
  const wrap = el('calendar-grid');
  const title = el('calendar-title');
  if (!wrap || !title) return;

  const { year, month } = state.calendarMonth;
  title.textContent = `${RU_MONTHS_NOM[month]} ${year}`;

  const { dates, cells } = computeCalendarStates(year, month);
  const today = new Date().toISOString().slice(0, 10);
  const houses = state.houses.slice().sort((a, b) => Number(a.num) - Number(b.num));

  const cols = `200px repeat(${dates.length}, minmax(30px, 1fr))`;

  const headCells = ['<div class="calendar-grid__head calendar-grid__head--corner">Размещение</div>']
    .concat(dates.map((iso) => {
      const day = Number(iso.slice(-2));
      const dow = new Date(iso + 'T00:00:00').getDay();
      const weekend = dow === 0 || dow === 6 ? ' calendar-grid__head--weekend' : '';
      return `<div class="calendar-grid__head${weekend}">${day}</div>`;
    }))
    .join('');

  const rowCells = houses.map((h) => {
    const label = `<div class="calendar-grid__label" title="${escapeHtml(houseDisplayName(h))}">${escapeHtml(houseDisplayName(h))}</div>`;
    const days = dates.map((iso) => {
      const cell = cells.get(`${h.num}|${iso}`);
      const dow = new Date(iso + 'T00:00:00').getDay();
      const isWeekend = dow === 0 || dow === 6;
      const classes = ['calendar-cell'];
      if (isWeekend) classes.push('calendar-cell--weekend');
      if (iso === today) classes.push('calendar-cell--today');
      if (cell) classes.push(`calendar-cell--${cell.state}`);
      const t = cell ? ` title="${escapeHtml(cell.label)}"` : '';
      return `<div class="${classes.join(' ')}"${t}></div>`;
    }).join('');
    return label + days;
  }).join('');

  wrap.innerHTML = `<div class="calendar-grid" style="grid-template-columns:${cols}">${headCells}${rowCells}</div>`;
}

el('calendar-prev').addEventListener('click', () => {
  const { year, month } = state.calendarMonth;
  const d = new Date(year, month - 1, 1);
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
});

el('calendar-next').addEventListener('click', () => {
  const { year, month } = state.calendarMonth;
  const d = new Date(year, month + 1, 1);
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
});

el('calendar-today').addEventListener('click', () => {
  const d = new Date();
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
});

/* Settings */

function renderSettings() {
  const f = el('settings-form');
  if (!f) return;
  f.sitePhone.value = state.settings.sitePhone || '';
  f.sitePhoneSecondary.value = state.settings.sitePhoneSecondary || '';
  f.siteEmail.value = state.settings.siteEmail || '';
  f.maxChannelUrl.value = state.settings.maxChannelUrl || '';
}

el('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const status = el('settings-status');
  status.textContent = 'Сохраняем…';
  const payload = {
    sitePhone: f.sitePhone.value.trim(),
    sitePhoneSecondary: f.sitePhoneSecondary.value.trim(),
    siteEmail: f.siteEmail.value.trim(),
    maxChannelUrl: f.maxChannelUrl.value.trim(),
  };
  try {
    const res = await api('/api/admin/settings', { method: 'PUT', body: payload });
    state.settings = res.settings;
    status.textContent = 'Сохранено. Обновите главную, чтобы увидеть изменения.';
    setTimeout(() => { status.textContent = ''; }, 4000);
  } catch (err) {
    status.textContent = 'Ошибка: ' + err.message;
  }
});

boot();
