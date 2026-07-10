let HOUSES = [];

let defaultPricePerNight = 5000;
let pricePerNight = 5000;

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

function houseLabel(h) {
  if (h.title) return h.title;
  if (h.type === 'room') return `Гостевой номер № ${h.num}`;
  if (h.type === 'whole') return 'Аренда всей базы';
  return `Домик № ${h.num}`;
}

const CATEGORY_META = {
  cabin: {
    title: 'Домики',
    fallbackImg: '/images/house-1.jpg',
    priceLabel: 'от {min} ₽/ночь',
  },
  room: {
    title: 'Гостевые номера',
    fallbackImg: '/images/room-1.jpg',
    priceLabel: 'от {min} ₽/ночь',
  },
  whole: {
    title: 'Аренда всей базы',
    fallbackImg: '/images/overview.jpg',
    priceLabel: '{min} ₽/ночь',
  },
};

function categoryHouses(cat) {
  return HOUSES.filter((h) => (h.type || 'cabin') === cat);
}

function categoryTileHtml(cat) {
  const meta = CATEGORY_META[cat];
  const houses = categoryHouses(cat);
  if (!houses.length) return '';
  const prices = houses.map((h) => Number(h.pricePerNight) || defaultPricePerNight);
  const minPrice = Math.min(...prices);
  const maxGuests = Math.max(...houses.map((h) => Number(h.guests) || 0));
  const img = houses[0]?.imgs?.[0] || meta.fallbackImg;
  const countLine = cat === 'whole'
    ? `Вся территория, до ${maxGuests} гостей`
    : `${houses.length} ${cat === 'cabin' ? plural(houses.length, ['вариант', 'варианта', 'вариантов']) : plural(houses.length, ['номер', 'номера', 'номеров'])} · до ${maxGuests} гостей`;
  const priceLine = meta.priceLabel.replace('{min}', formatPrice(minPrice));
  return `
    <button type="button" class="booking-category" data-category="${cat}">
      <div class="booking-category__img" style="background-image:url('${img}')" aria-hidden="true"></div>
      <div class="booking-category__body">
        <h3 class="booking-category__title">${meta.title}</h3>
        <p class="booking-category__meta">${countLine}</p>
        <p class="booking-category__price">${priceLine}</p>
      </div>
    </button>
  `;
}

function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function findHouse(num) {
  const n = Number(num);
  return HOUSES.find((h) => Number(h.num) === n) || null;
}

function applySiteConfig(config) {
  if (config.pricePerNight) {
    defaultPricePerNight = config.pricePerNight;
    pricePerNight = config.pricePerNight;
  }

  document.querySelectorAll('[data-site-name]').forEach((el) => {
    if (el.classList.contains('logo__main')) {
      el.textContent = (config.siteName.split('-')[0] || config.siteName).trim().toUpperCase();
    } else {
      el.textContent = config.siteName;
    }
  });
  document.title = `Бронирование — ${config.siteName}`;
}

function formatPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(n);
}

function calcNights(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.max(1, Math.round((end - start) / 86400000));
}

function updateTotal() {
  const checkIn = document.getElementById('checkIn')?.value;
  const checkOut = document.getElementById('checkOut')?.value;
  const totalEl = document.getElementById('booking-total');
  if (!totalEl || !checkIn || !checkOut) return;

  const nights = calcNights(checkIn, checkOut);
  const amount = nights * pricePerNight;
  totalEl.innerHTML = `К оплате: <strong>${formatPrice(amount)} ₽</strong> · ${nights} ноч. · ${formatPrice(pricePerNight)} ₽/ночь`;
}

function onHouseChange() {
  const select = document.getElementById('houseNumber');
  const guestsInput = document.querySelector('input[name="guests"]');
  const h = findHouse(select?.value);
  pricePerNight = Number(h?.pricePerNight) || defaultPricePerNight;
  if (guestsInput && h?.guests) {
    guestsInput.max = String(h.guests);
    if (Number(guestsInput.value) > h.guests) guestsInput.value = String(h.guests);
  }
  updateTotal();
}

function populateHouseSelect(filterCategory) {
  const select = document.getElementById('houseNumber');
  if (!select) return;
  const list = filterCategory ? categoryHouses(filterCategory) : HOUSES;
  select.innerHTML = list
    .map((h) => `<option value="${h.num}">${houseLabel(h)} — ${formatPrice(Number(h.pricePerNight) || defaultPricePerNight)} ₽/ночь</option>`)
    .join('');
  onHouseChange();
}

function renderCategories() {
  const grid = document.getElementById('booking-choose-grid');
  if (!grid) return;
  grid.innerHTML = ['cabin', 'room', 'whole']
    .filter((cat) => categoryHouses(cat).length)
    .map(categoryTileHtml)
    .join('');
  grid.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => openListingModal(btn.dataset.category));
  });
}

let modalState = { category: null, houseNum: null };

function openListingModal(category) {
  const houses = categoryHouses(category);
  if (!houses.length) return;
  modalState = { category, houseNum: houses[0].num };
  renderListingModal();
  const modal = document.getElementById('listing-modal');
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeListingModal() {
  document.getElementById('listing-modal').hidden = true;
  document.body.classList.remove('modal-open');
}

function selectModalHouse(num) {
  modalState.houseNum = Number(num);
  renderListingModal();
}

function renderListingModal() {
  const body = document.getElementById('listing-modal-body');
  if (!body) return;
  const { category, houseNum } = modalState;
  const houses = categoryHouses(category);
  const current = houses.find((h) => Number(h.num) === Number(houseNum)) || houses[0];
  const meta = CATEGORY_META[category];

  const rawImgs = current.imgs && current.imgs.length ? current.imgs : (houses[0]?.imgs || []);
  const imgs = rawImgs.length ? rawImgs : [meta.fallbackImg];

  const price = Number(current.pricePerNight) || defaultPricePerNight;
  const specs = [
    `до ${current.guests || 1} гостей`,
    current.beds,
  ].filter(Boolean).join(' · ');

  const showPicker = houses.length > 1;
  const pickerHtml = showPicker ? `
    <div class="listing-modal__picker">
      <span class="listing-modal__picker-label">${category === 'cabin' ? 'Выберите домик' : 'Выберите номер'}:</span>
      <div class="listing-modal__picker-btns">
        ${houses.map((h) => `<button type="button" class="listing-modal__num${Number(h.num) === Number(current.num) ? ' is-active' : ''}" data-modal-house="${h.num}">${h.num}</button>`).join('')}
      </div>
    </div>` : '';

  body.innerHTML = `
    <header class="listing-modal__head">
      <p class="listing-modal__eyebrow">${meta.title}</p>
      <h2 class="listing-modal__title">${houseLabel(current)}</h2>
      <p class="listing-modal__specs">${specs} · <span class="listing-modal__price">${formatPrice(price)} ₽/ночь</span></p>
    </header>

    <div class="listing-modal__gallery" role="list">
      ${imgs.map((u, i) => `<div class="listing-modal__slide" role="listitem"><img src="${u}" alt="${houseLabel(current)} — фото ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}"></div>`).join('')}
    </div>

    ${current.description ? `<p class="listing-modal__desc">${current.description}</p>` : ''}

    ${pickerHtml}

    <div class="listing-modal__actions">
      <a href="/house.html?num=${current.num}" class="btn btn--ghost">Подробнее</a>
      <button type="button" class="btn btn--find btn--lg" data-modal-book>Забронировать</button>
    </div>
  `;

  body.querySelectorAll('[data-modal-house]').forEach((btn) => {
    btn.addEventListener('click', () => selectModalHouse(btn.dataset.modalHouse));
  });
  const bookBtn = body.querySelector('[data-modal-book]');
  if (bookBtn) bookBtn.addEventListener('click', () => {
    closeListingModal();
    showForm(category, current.num);
  });
}

function initModal() {
  const modal = document.getElementById('listing-modal');
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target.matches('[data-modal-close]')) closeListingModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeListingModal();
  });
}

function showChoose() {
  document.getElementById('booking-choose').hidden = false;
  document.getElementById('booking-form-wrap').hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showForm(category, preselectHouseNum) {
  populateHouseSelect(category);
  const select = document.getElementById('houseNumber');
  if (preselectHouseNum && select && [...select.options].some((o) => o.value === String(preselectHouseNum))) {
    select.value = String(preselectHouseNum);
    onHouseChange();
  }
  document.getElementById('booking-choose').hidden = true;
  document.getElementById('booking-form-wrap').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initChooseFlow() {
  renderCategories();

  const backBtn = document.getElementById('booking-back');
  if (backBtn) backBtn.addEventListener('click', showChoose);

  const params = new URLSearchParams(location.search);
  const preselect = params.get('house');
  if (preselect) {
    const h = findHouse(preselect);
    if (h) return showForm(h.type || 'cabin', preselect);
  }
  showChoose();
}

function initHouseSelect() {
  const select = document.getElementById('houseNumber');
  if (!select) return;
  select.addEventListener('change', onHouseChange);
}

function initDates() {
  const checkIn = document.getElementById('checkIn');
  const checkOut = document.getElementById('checkOut');
  if (!checkIn || !checkOut) return;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const fmt = (d) => d.toISOString().slice(0, 10);
  checkIn.min = fmt(today);
  checkOut.min = fmt(tomorrow);

  const params = new URLSearchParams(location.search);
  checkIn.value = params.get('checkIn') || fmt(tomorrow);
  checkOut.value = params.get('checkOut') || fmt(dayAfter);

  checkIn.addEventListener('change', () => {
    const next = new Date(checkIn.value);
    next.setDate(next.getDate() + 1);
    checkOut.min = fmt(next);
    if (checkOut.value <= checkIn.value) checkOut.value = fmt(next);
    updateTotal();
  });

  checkOut.addEventListener('change', updateTotal);
  updateTotal();
}

function initForm() {
  const form = document.getElementById('booking-form');
  const errorEl = document.getElementById('booking-error');
  const submitBtn = form?.querySelector('.booking-form__submit');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;

    const data = Object.fromEntries(new FormData(form));
    data.houseNumber = Number(data.houseNumber);
    data.guests = Number(data.guests);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Создаём платёж…';
    }

    try {
      const res = await fetch('/api/booking/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!res.ok || !json.ok || !json.paymentUrl) {
        throw new Error(json.error || 'Не удалось создать платёж');
      }

      window.location.href = json.paymentUrl;
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Перейти к оплате';
      }
    }
  });
}

async function main() {
  try {
    const [config, houses] = await Promise.all([loadConfig(), loadHouses()]);
    HOUSES = houses;
    applySiteConfig(config);
  } catch (err) {
    console.warn(err);
  }

  initHouseSelect();
  initDates();
  initForm();
  initChooseFlow();
  initModal();
  updateTotal();
}

main();
