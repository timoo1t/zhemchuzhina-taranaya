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
  return h.title || `Домик № ${h.num}`;
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

function initHouseSelect() {
  const select = document.getElementById('houseNumber');
  if (!select) return;

  select.innerHTML = HOUSES
    .map((h) => `<option value="${h.num}">${houseLabel(h)} — ${formatPrice(Number(h.pricePerNight) || defaultPricePerNight)} ₽/ночь</option>`)
    .join('');

  const params = new URLSearchParams(location.search);
  const house = params.get('house');
  if (house && findHouse(house)) select.value = house;

  select.addEventListener('change', onHouseChange);
  onHouseChange();
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
  updateTotal();
}

main();
