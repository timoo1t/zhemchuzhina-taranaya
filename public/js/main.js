let HOUSES = [];
let REVIEWS = [];
let pricePerNight = 6000;

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Config load failed');
  return res.json();
}

async function loadHouses() {
  const res = await fetch('/api/houses');
  if (!res.ok) throw new Error('Houses load failed');
  const data = await res.json();
  return Array.isArray(data.houses) ? data.houses : [];
}

async function loadReviews() {
  const res = await fetch('/api/reviews');
  if (!res.ok) throw new Error('Reviews load failed');
  const data = await res.json();
  return Array.isArray(data.reviews) ? data.reviews : [];
}

function applySiteConfig(config) {
  if (config.pricePerNight) pricePerNight = config.pricePerNight;

  document.querySelectorAll('[data-site-name]').forEach((el) => {
    if (el.classList.contains('logo__main')) {
      el.textContent = config.siteName.split('-')[0]?.trim().toUpperCase() || 'ЖЕМЧУЖИНА';
    } else {
      el.textContent = config.siteName;
    }
  });

  const phoneEl = document.querySelector('[data-site-phone]');
  if (phoneEl && config.sitePhone) {
    phoneEl.textContent = config.sitePhone;
    phoneEl.href = `tel:${config.sitePhone.replace(/\s/g, '')}`;
  }

  const emailEl = document.querySelector('[data-site-email]');
  if (emailEl && config.siteEmail) {
    emailEl.textContent = config.siteEmail;
    emailEl.href = `mailto:${config.siteEmail}`;
  }

  document.querySelectorAll('[data-site-max]').forEach((el) => {
    if (config.maxChannelUrl) {
      el.href = config.maxChannelUrl;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  });

  document.title = `${config.siteName} — аренда домиков, село Таранай`;
}

function formatPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(n);
}

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDateRu(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS_GEN[m - 1]} ${y}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderGroupCard({ groupId, title, meta, items, pickerLabel }) {
  const first = items[0];
  const cover = (first.imgs && first.imgs[0]) || '';
  const price = Number(first.pricePerNight) || pricePerNight;
  const tags = (first.tags || []).slice(0, 3);
  const optionLabel = (h) => `${h.title || `Домик № ${h.num}`} · до ${h.guests} гостей`;

  return `
    <article class="listing-card listing-card--group" data-group="${groupId}">
      <a href="/house.html?num=${first.num}" class="listing-card__media" data-card-link aria-label="Подробнее">
        ${cover ? `<img src="${cover}" alt="${escapeHtml(title)}" loading="lazy" data-card-img>` : `<div class="listing-card__media-placeholder">Фото скоро</div>`}
      </a>
      <div class="listing-card__body">
        <div class="listing-card__row">
          <h3 class="listing-card__name">${escapeHtml(title)}</h3>
          <span class="listing-card__guests" data-card-guests>до ${first.guests} гостей</span>
        </div>
        <p class="listing-card__meta">${escapeHtml(meta)}</p>
        ${tags.length ? `<ul class="listing-card__tags">${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
        <label class="listing-card__picker">
          <span>${escapeHtml(pickerLabel)}</span>
          <select data-card-select>
            ${items.map((h) => `<option value="${h.num}">${escapeHtml(optionLabel(h))}</option>`).join('')}
          </select>
        </label>
        <p class="listing-card__price">
          <span class="listing-card__price-from">от</span>
          <span class="listing-card__price-num" data-card-price>${formatPrice(price)} ₽</span>
          <span class="listing-card__price-unit">/ ночь</span>
        </p>
        <a href="/house.html?num=${first.num}" class="btn btn--book listing-card__cta" data-card-link>Подробнее</a>
      </div>
    </article>
  `;
}

function renderSingleCard(h) {
  const cover = (h.imgs && h.imgs[0]) || '';
  const price = Number(h.pricePerNight) || pricePerNight;
  const tags = (h.tags || []).slice(0, 3);
  const title = h.title || `Домик № ${h.num}`;
  return `
    <a href="/house.html?num=${h.num}" class="listing-card">
      <div class="listing-card__media">
        ${cover ? `<img src="${cover}" alt="${escapeHtml(title)}" loading="lazy">` : `<div class="listing-card__media-placeholder">Фото скоро</div>`}
      </div>
      <div class="listing-card__body">
        <div class="listing-card__row">
          <h3 class="listing-card__name">${escapeHtml(title)}</h3>
          <span class="listing-card__guests">до ${h.guests} гостей</span>
        </div>
        <p class="listing-card__meta">${escapeHtml(h.beds || '')}</p>
        ${tags.length ? `<ul class="listing-card__tags">${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
        <p class="listing-card__price">
          <span class="listing-card__price-from">от</span>
          <span class="listing-card__price-num">${formatPrice(price)} ₽</span>
          <span class="listing-card__price-unit">/ ночь</span>
        </p>
      </div>
    </a>
  `;
}

function bindGroupCard(card) {
  const groupId = card.dataset.group;
  const items = HOUSES.filter((h) => (groupId === 'cabins' ? h.type === 'cabin' : h.type === 'room'));
  const select = card.querySelector('[data-card-select]');
  const links = card.querySelectorAll('[data-card-link]');
  const img = card.querySelector('[data-card-img]');
  const guests = card.querySelector('[data-card-guests]');
  const priceEl = card.querySelector('[data-card-price]');

  select?.addEventListener('change', () => {
    const num = Number(select.value);
    const h = items.find((x) => Number(x.num) === num);
    if (!h) return;

    links.forEach((a) => { a.href = `/house.html?num=${num}`; });
    if (img && h.imgs && h.imgs[0]) img.src = h.imgs[0];
    if (guests) guests.textContent = `до ${h.guests} гостей`;
    if (priceEl) priceEl.textContent = `${formatPrice(Number(h.pricePerNight) || pricePerNight)} ₽`;
  });
}

function renderHouses() {
  const grid = document.getElementById('houses-grid');
  if (!grid) return;

  const countEl = document.getElementById('houses-count');
  if (countEl) countEl.textContent = HOUSES.length;

  const cabins = HOUSES.filter((h) => h.type === 'cabin');
  const rooms = HOUSES.filter((h) => h.type === 'room');
  const whole = HOUSES.find((h) => h.type === 'whole');

  const cards = [];

  if (cabins.length) {
    cards.push(renderGroupCard({
      groupId: 'cabins',
      title: 'Домики',
      meta: `${cabins.length} модульных домиков у моря`,
      items: cabins,
      pickerLabel: 'Выберите домик',
    }));
  }

  if (rooms.length) {
    cards.push(renderGroupCard({
      groupId: 'rooms',
      title: 'Гостевые номера',
      meta: `${rooms.length} номера в главном доме`,
      items: rooms,
      pickerLabel: 'Выберите номер',
    }));
  }

  if (whole) cards.push(renderSingleCard(whole));

  grid.innerHTML = cards.join('');
  grid.querySelectorAll('[data-group]').forEach(bindGroupCard);
}

function initReviewForm() {
  const form = document.getElementById('review-form');
  if (!form) return;

  const houseSelect = document.getElementById('review-form-house');
  if (houseSelect) {
    houseSelect.innerHTML = '<option value="">Не указывать</option>' +
      HOUSES
        .filter((h) => h.type !== 'whole')
        .map((h) => `<option value="${h.num}">${h.title || `Домик № ${h.num}`}</option>`)
        .join('');
  }

  const ratingWrap = document.getElementById('review-rating');
  const ratingInput = ratingWrap.querySelector('input[name="rating"]');
  const stars = ratingWrap.querySelectorAll('button[data-star]');

  const paintStars = (n) => {
    stars.forEach((btn) => {
      const val = Number(btn.dataset.star);
      btn.classList.toggle('is-on', val <= n);
    });
  };
  paintStars(Number(ratingInput.value));

  stars.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.star);
      ratingInput.value = String(val);
      paintStars(val);
    });
    btn.addEventListener('mouseenter', () => paintStars(Number(btn.dataset.star)));
  });
  ratingWrap.addEventListener('mouseleave', () => paintStars(Number(ratingInput.value)));

  const status = document.getElementById('review-form-status');
  const submitBtn = form.querySelector('button[type="submit"]');

  const showStatus = (msg, kind) => {
    status.textContent = msg;
    status.dataset.kind = kind;
    status.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    const payload = {
      author: form.author.value.trim(),
      houseNum: form.houseNum.value ? Number(form.houseNum.value) : null,
      rating: Number(ratingInput.value),
      text: form.text.value.trim(),
      consent: form.consent.checked,
    };

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось отправить');
      REVIEWS.push(data.review);
      renderReviews();
      form.reset();
      ratingInput.value = '5';
      paintStars(5);
      showStatus('Спасибо за отзыв! Он уже виден на странице.', 'ok');
    } catch (err) {
      showStatus(err.message, 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Опубликовать';
    }
  });
}

function renderReviews() {
  const grid = document.getElementById('reviews-grid');
  if (!grid) return;

  const items = REVIEWS
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);

  if (!items.length) {
    grid.innerHTML = '<p class="reviews-empty">Скоро появятся первые отзывы.</p>';
    return;
  }

  grid.innerHTML = items.map((r) => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const houseLine = r.houseNum ? ` · Домик № ${r.houseNum}` : '';
    return `
    <article class="review-card">
      <p class="review-card__stars" aria-label="Оценка ${r.rating} из 5">${stars}</p>
      <blockquote class="review-card__text">${escapeHtml(r.text)}</blockquote>
      <footer class="review-card__author">
        <strong>${escapeHtml(r.author)}</strong>
        <span class="review-card__meta">${formatDateRu(r.date)}${houseLine}</span>
      </footer>
    </article>
    `;
  }).join('');
}

const MONTHS = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtIso(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function partsToIso(day, month, year) {
  if (!day || !month || !year) return '';
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y) return '';
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const check = new Date(`${iso}T12:00:00`);
  if (check.getFullYear() !== y || check.getMonth() + 1 !== m || check.getDate() !== d) return '';
  return iso;
}

function isoToParts(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { day: d, month: m, year: y };
}

function fillMonthSelect(select) {
  if (!select || select.options.length) return;
  select.innerHTML = MONTHS.map((name, i) =>
    `<option value="${i + 1}">${name}</option>`
  ).join('');
}

function initDateParts(container) {
  const hidden = container.querySelector('input[type="hidden"]');
  const native = container.querySelector('.date-parts__native');
  const dayEl = container.querySelector('.date-parts__day');
  const monthEl = container.querySelector('.date-parts__month');
  const yearEl = container.querySelector('.date-parts__year');

  fillMonthSelect(monthEl);

  const syncFromParts = () => {
    const iso = partsToIso(dayEl.value, monthEl.value, yearEl.value);
    hidden.value = iso;
    if (native && iso) native.value = iso;
    container.dispatchEvent(new CustomEvent('datechange', { detail: { iso } }));
    return iso;
  };

  const setFromIso = (iso) => {
    const p = isoToParts(iso);
    if (!p) return;
    dayEl.value = p.day;
    monthEl.value = p.month;
    yearEl.value = p.year;
    hidden.value = iso;
    if (native) native.value = iso;
  };

  [dayEl, monthEl, yearEl].forEach((el) => {
    el.addEventListener('input', syncFromParts);
    el.addEventListener('change', syncFromParts);
  });

  if (native) {
    native.addEventListener('change', () => {
      if (native.value) setFromIso(native.value);
    });
  }

  return { setFromIso, syncFromParts, getIso: () => hidden.value, native };
}

function initQuickBook() {
  const form = document.getElementById('quick-book');
  if (!form) return;

  const checkIn = initDateParts(form.querySelector('#qb-checkin-parts'));
  const checkOut = initDateParts(form.querySelector('#qb-checkout-parts'));
  const house = form.querySelector('#qb-house');

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  checkIn.setFromIso(fmtIso(tomorrow));
  checkOut.setFromIso(fmtIso(dayAfter));

  form.querySelector('#qb-checkin-parts').addEventListener('datechange', (e) => {
    const iso = e.detail.iso;
    if (!iso) return;
    const next = new Date(`${iso}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const outIso = checkOut.getIso();
    if (!outIso || outIso <= iso) checkOut.setFromIso(fmtIso(next));
  });

  const params = new URLSearchParams(location.search);
  if (params.get('house')) house.value = params.get('house');
  if (params.get('checkIn')) checkIn.setFromIso(params.get('checkIn'));
  if (params.get('checkOut')) checkOut.setFromIso(params.get('checkOut'));

  form.querySelectorAll('[data-picker-for]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.pickerFor);
      if (!el) return;
      if (typeof el.showPicker === 'function') {
        try { el.showPicker(); } catch { el.focus(); }
      } else {
        el.focus();
      }
    });
  });

  form.addEventListener('submit', (e) => {
    checkIn.syncFromParts();
    checkOut.syncFromParts();
    if (!checkIn.getIso() || !checkOut.getIso()) {
      e.preventDefault();
      alert('Укажите корректные даты заезда и выезда');
    }
  });
}

function initHeaderScroll() {
  const header = document.getElementById('header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('header--solid', window.scrollY > 80);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initBurger() {
  const burger = document.getElementById('burger');
  const header = document.querySelector('.header');
  if (!burger || !header) return;

  burger.addEventListener('click', () => {
    header.classList.toggle('nav-open');
    header.classList.add('header--solid');
  });
}

function initReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = document.querySelectorAll(
    '.section-listings, .section-about, .section-amenities, .section-reviews, .section-map, .section-contacts'
  );

  targets.forEach((el) => el.classList.add('reveal'));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -80px 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

async function main() {
  document.getElementById('year').textContent = new Date().getFullYear();
  initHeaderScroll();
  initBurger();

  const [housesResult, reviewsResult, configResult] = await Promise.allSettled([
    loadHouses(),
    loadReviews(),
    loadConfig(),
  ]);

  HOUSES = housesResult.status === 'fulfilled' ? housesResult.value : [];
  REVIEWS = reviewsResult.status === 'fulfilled' ? reviewsResult.value : [];
  if (configResult.status === 'fulfilled') applySiteConfig(configResult.value);

  initQuickBook();
  renderHouses();
  renderReviews();
  initReviewForm();
  initReveal();
}

main();
