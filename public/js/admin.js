const state = {
  houses: [],
  blocked: [],
  reviews: [],
  bookings: [],
  bookingsFilter: 'all',
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
  const [housesRes, blockedRes, reviewsRes, bookingsRes] = await Promise.all([
    api('/api/houses'),
    api('/api/admin/blocked-dates'),
    api('/api/admin/reviews'),
    api('/api/admin/bookings'),
  ]);
  state.houses = housesRes.houses || [];
  state.blocked = blockedRes.ranges || [];
  state.reviews = reviewsRes.reviews || [];
  state.bookings = bookingsRes.bookings || [];

  populateHouseSelects();
  renderHouses();
  renderBlocked();
  renderReviews();
  renderBookings();
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

function renderBookings() {
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
    const paid = b.status === 'paid';
    const nights = nightsBetween(b.checkIn, b.checkOut);
    return `
    <article class="booking-card booking-card--${escapeHtml(b.status)}">
      <header class="booking-card__head">
        <div>
          <span class="booking-card__id">${escapeHtml(b.id)}</span>
          <h4 class="booking-card__title">Домик № ${b.houseNumber}</h4>
        </div>
        <span class="booking-card__status booking-card__status--${escapeHtml(b.status)}">
          ${paid ? 'Оплачено' : 'Ожидает оплаты'}
        </span>
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
          ${paid && b.paidAt ? `<span class="booking-card__sub">Оплата: ${formatDateTimeRu(b.paidAt)}</span>` : ''}
        </div>
      </div>

      <footer class="booking-card__foot">
        <span>Создана: ${formatDateTimeRu(b.createdAt)}</span>
        ${b.paymentId ? `<span>ЮKassa: ${escapeHtml(b.paymentId)}</span>` : ''}
      </footer>
    </article>
    `;
  }).join('');
}

document.getElementById('bookings-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('.bookings-filter__btn');
  if (!btn) return;
  state.bookingsFilter = btn.dataset.status;
  document.querySelectorAll('.bookings-filter__btn').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  renderBookings();
});

function populateHouseSelects() {
  const options = state.houses.map((h) => `<option value="${h.num}">Домик № ${h.num}</option>`).join('');
  el('blocked-house').innerHTML = options;
  el('review-house').innerHTML = '<option value="">—</option>' + options;
}

/* Houses */

function renderHouses() {
  const wrap = el('admin-houses');
  wrap.innerHTML = state.houses.map((h) => `
    <details class="admin-house" data-num="${h.num}">
      <summary>
        <span class="admin-house__name">Домик № ${h.num}</span>
        <span class="admin-house__meta">до ${h.guests} · ${escapeHtml(h.beds)}</span>
      </summary>
      <form class="admin-house__form" data-house-form="${h.num}">
        <div class="admin-form__row">
          <label class="booking-form__field">
            <span>Гостей</span>
            <input type="number" name="guests" min="1" max="20" value="${h.guests}">
          </label>
          <label class="booking-form__field">
            <span>Спальни</span>
            <input type="text" name="beds" value="${escapeHtml(h.beds)}">
          </label>
        </div>
        <label class="booking-form__field">
          <span>Теги (через запятую)</span>
          <input type="text" name="tags" value="${escapeHtml((h.tags || []).join(', '))}">
        </label>
        <label class="booking-form__field">
          <span>Фото (один URL на строку, первый — обложка)</span>
          <textarea name="imgs" rows="4">${escapeHtml((h.imgs || []).join('\n'))}</textarea>
        </label>
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
  `).join('');

  wrap.querySelectorAll('form[data-house-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const num = form.dataset.houseForm;
      const status = wrap.querySelector(`[data-status="${num}"]`);
      status.textContent = 'Сохраняем…';
      const payload = {
        guests: Number(form.guests.value),
        beds: form.beds.value.trim(),
        tags: form.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
        imgs: form.imgs.value.split(/\n+/).map((s) => s.trim()).filter(Boolean),
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
        <h4>Домик № ${num}</h4>
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
          <span class="admin-review__meta">${r.date} · ${r.rating}/5${r.houseNum ? ` · Домик № ${r.houseNum}` : ''}</span>
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

boot();
