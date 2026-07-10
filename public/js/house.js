let pricePerNight = 5000;
let defaultPricePerNight = 5000;
let currentImgs = [];
let currentLightboxIdx = 0;
let blockedRanges = [];

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(n);
}

function formatDateRu(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS_GEN[m - 1]} ${y}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtIso(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function pluralRu(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Config load failed');
  return res.json();
}

async function loadHouse(num) {
  const res = await fetch(`/api/houses/${num}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.house || null;
}

async function loadReviews() {
  const res = await fetch('/api/reviews');
  if (!res.ok) return [];
  const data = await res.json();
  return data.reviews || [];
}

async function loadAvailability(num) {
  const res = await fetch(`/api/availability/${num}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.blocked || [];
}

function applySiteConfig(config) {
  if (config.pricePerNight) {
    defaultPricePerNight = config.pricePerNight;
    pricePerNight = config.pricePerNight;
  }

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
}

function getHouseNum() {
  const raw = new URLSearchParams(location.search).get('num');
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* Gallery */

function renderGallery(imgs) {
  const grid = document.getElementById('gallery-grid');
  const note = document.getElementById('gallery-note');
  const btn = document.getElementById('gallery-open-all');
  const label = document.getElementById('gallery-all-label');

  if (!imgs.length) {
    grid.innerHTML = '<div class="house-gallery__placeholder">Фото скоро</div>';
    btn.hidden = true;
    note.hidden = false;
    return;
  }

  const slots = 5;
  const filled = imgs.slice(0, slots);
  const items = [];
  for (let i = 0; i < slots; i++) {
    if (filled[i]) {
      items.push(`<button type="button" class="house-gallery__cell" data-idx="${i}"><img src="${filled[i]}" alt="Фото ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}"></button>`);
    } else {
      items.push(`<div class="house-gallery__cell house-gallery__cell--empty">Фото скоро</div>`);
    }
  }
  grid.innerHTML = items.join('');

  grid.querySelectorAll('[data-idx]').forEach((cell) => {
    cell.addEventListener('click', () => openLightbox(Number(cell.dataset.idx)));
  });

  if (imgs.length > 1) {
    btn.hidden = false;
    label.textContent = `Показать все фото (${imgs.length})`;
    btn.onclick = () => openLightbox(0);
    note.hidden = true;
  } else {
    btn.hidden = true;
    note.hidden = false;
  }
}

function openLightbox(startIdx) {
  if (!currentImgs.length) return;
  currentLightboxIdx = Math.max(0, Math.min(startIdx, currentImgs.length - 1));
  const box = document.getElementById('lightbox');
  box.hidden = false;
  box.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  updateLightbox();
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function updateLightbox() {
  document.getElementById('lightbox-img').src = currentImgs[currentLightboxIdx];
  document.getElementById('lightbox-counter').textContent = `${currentLightboxIdx + 1} / ${currentImgs.length}`;
  document.getElementById('lightbox-prev').hidden = currentImgs.length <= 1;
  document.getElementById('lightbox-next').hidden = currentImgs.length <= 1;
}

function initLightbox() {
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => {
    currentLightboxIdx = (currentLightboxIdx - 1 + currentImgs.length) % currentImgs.length;
    updateLightbox();
  });
  document.getElementById('lightbox-next').addEventListener('click', () => {
    currentLightboxIdx = (currentLightboxIdx + 1) % currentImgs.length;
    updateLightbox();
  });
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    const box = document.getElementById('lightbox');
    if (box.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') document.getElementById('lightbox-prev').click();
    if (e.key === 'ArrowRight') document.getElementById('lightbox-next').click();
  });
}

/* Availability + booking widget */

function rangeOverlapsBlocked(from, to) {
  for (const b of blockedRanges) {
    if (from < b.to && to > b.from) return b;
  }
  return null;
}

function nightsBetween(from, to) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

function updateWidgetSummary() {
  const from = document.getElementById('widget-checkin').value;
  const to = document.getElementById('widget-checkout').value;
  const summary = document.getElementById('widget-summary');
  const warn = document.getElementById('widget-warn');
  const submit = document.getElementById('widget-submit');

  warn.hidden = true;
  warn.textContent = '';

  if (!from || !to) {
    summary.innerHTML = '<span>Выберите даты</span>';
    submit.disabled = false;
    return;
  }

  if (to <= from) {
    summary.innerHTML = '<span>Дата выезда должна быть позже заезда</span>';
    submit.disabled = true;
    return;
  }

  const conflict = rangeOverlapsBlocked(from, to);
  if (conflict) {
    warn.textContent = `Эти даты заняты (${formatDateRu(conflict.from)} — ${formatDateRu(conflict.to)}). Выберите другие.`;
    warn.hidden = false;
  }

  const nights = nightsBetween(from, to);
  const total = nights * pricePerNight;
  summary.innerHTML = `
    <span>${nights} ${pluralRu(nights, ['ночь', 'ночи', 'ночей'])} · ${formatPrice(pricePerNight)} ₽</span>
    <strong>${formatPrice(total)} ₽</strong>
  `;
  submit.disabled = Boolean(conflict);
}

function initWidget(house) {
  const houseNum = house.num;
  const form = document.getElementById('widget-form');
  const checkIn = document.getElementById('widget-checkin');
  const checkOut = document.getElementById('widget-checkout');
  const guestsInput = document.getElementById('widget-guests');

  if (guestsInput && house.guests) {
    guestsInput.max = String(house.guests);
    if (Number(guestsInput.value) > house.guests) guestsInput.value = String(house.guests);
    guestsInput.addEventListener('change', () => {
      const v = Number(guestsInput.value) || 1;
      if (v > house.guests) guestsInput.value = String(house.guests);
      if (v < 1) guestsInput.value = '1';
    });
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  checkIn.min = fmtIso(today);
  checkOut.min = fmtIso(tomorrow);
  checkIn.value = fmtIso(tomorrow);
  checkOut.value = fmtIso(dayAfter);

  checkIn.addEventListener('change', () => {
    if (checkOut.value <= checkIn.value) {
      const next = new Date(`${checkIn.value}T12:00:00`);
      next.setDate(next.getDate() + 1);
      checkOut.value = fmtIso(next);
    }
    checkOut.min = checkIn.value;
    updateWidgetSummary();
  });
  checkOut.addEventListener('change', updateWidgetSummary);

  document.getElementById('widget-price').textContent = formatPrice(pricePerNight);

  updateWidgetSummary();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const from = checkIn.value;
    const to = checkOut.value;
    if (!from || !to || to <= from) return;
    if (rangeOverlapsBlocked(from, to)) return;
    const guests = document.getElementById('widget-guests').value || 2;
    const params = new URLSearchParams({ house: String(houseNum), checkIn: from, checkOut: to, guests });
    location.href = `/booking.html?${params.toString()}`;
  });
}

/* Reviews */

function renderReviews(reviews, houseNum) {
  const wrap = document.getElementById('house-reviews-section');
  const grid = document.getElementById('house-reviews-grid');

  const own = reviews.filter((r) => Number(r.houseNum) === Number(houseNum));
  const show = (own.length ? own : reviews).slice(0, 6);

  if (!show.length) return;

  wrap.hidden = false;
  grid.innerHTML = show.map((r) => {
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

/* Render house */

function renderHouse(house) {
  const title = house.title || `Домик № ${house.num}`;
  document.title = `${title} — Жемчужина-Тараная`;
  document.getElementById('house-title').textContent = title;
  document.getElementById('house-meta').textContent =
    `до ${house.guests} гостей · ${house.beds || '—'} · ${(house.tags || []).join(' · ')}`;

  pricePerNight = Number(house.pricePerNight) || defaultPricePerNight;

  currentImgs = Array.isArray(house.imgs) ? house.imgs.filter(Boolean) : [];
  renderGallery(currentImgs);

  if (house.description && house.description.trim()) {
    document.getElementById('house-description-section').hidden = false;
    document.getElementById('house-description-text').textContent = house.description;
  }

  const amenities = Array.isArray(house.amenities) ? house.amenities.filter(Boolean) : [];
  if (amenities.length) {
    document.getElementById('house-inside-section').hidden = false;
    document.getElementById('house-inside-list').innerHTML = amenities
      .map((a) => `<li>${escapeHtml(a)}</li>`)
      .join('');
  }
}

async function main() {
  document.getElementById('year').textContent = new Date().getFullYear();
  initLightbox();

  const num = getHouseNum();
  let house = null;

  if (num) {
    try {
      house = await loadHouse(num);
    } catch (err) {
      console.warn(err);
    }
  }

  if (!house) {
    document.getElementById('house-notfound').hidden = false;
    return;
  }

  document.getElementById('house-detail').hidden = false;

  const [configResult, availabilityResult, reviewsResult] = await Promise.allSettled([
    loadConfig(),
    loadAvailability(house.num),
    loadReviews(),
  ]);

  if (configResult.status === 'fulfilled') applySiteConfig(configResult.value);
  blockedRanges = availabilityResult.status === 'fulfilled' ? availabilityResult.value : [];

  renderHouse(house);
  initWidget(house);

  const reviews = reviewsResult.status === 'fulfilled' ? reviewsResult.value : [];
  renderReviews(reviews, house.num);
}

main();
