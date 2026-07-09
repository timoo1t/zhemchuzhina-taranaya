import './src/load-env.js';
import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './src/load-env.js';
import { YooKassaClient } from './src/yookassa-client.js';
import {
  createBooking,
  getBooking,
  markBookingPaid,
  bookingToMaxPayload,
  getBookedRanges,
  getAllBookings,
} from './src/booking-store.js';
import { notifyAdminAboutBooking } from './src/notify-booking.js';
import { sendBookingReceiptEmail } from './src/booking-email.js';
import {
  getHouses,
  getHouse,
  updateHouse,
  getBlockedRanges,
  addBlockedRange,
  deleteBlockedRange,
  getReviews,
  addReview,
  updateReview,
  deleteReview,
} from './src/content-store.js';
import {
  loginHandler,
  logoutHandler,
  statusHandler,
  requireAdmin,
} from './src/admin-auth.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);

function publicSiteUrl(req) {
  const fromEnv =
    process.env.SITE_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    process.env.PINGGY_PUBLIC_URL;

  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

function siteBase(req) {
  return publicSiteUrl(req);
}

const DEFAULT_PRICE_PER_NIGHT = Number(process.env.BOOKING_PRICE_PER_NIGHT) || 5000;

function priceForHouse(houseOrNum) {
  const house = typeof houseOrNum === 'object' ? houseOrNum : getHouse(houseOrNum);
  return Number(house?.pricePerNight) || DEFAULT_PRICE_PER_NIGHT;
}

function calcAmount(houseNumber, checkIn, checkOut) {
  const perNight = priceForHouse(houseNumber);
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const nights = Math.max(1, Math.round((end - start) / 86400000));
  return nights * perNight;
}

function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom < bTo && aTo > bFrom;
}

function crossBlockedRangesFor(num) {
  const houses = getHouses();
  const target = houses.find((h) => Number(h.num) === Number(num));
  if (!target) return [];

  const whole = houses.find((h) => h.type === 'whole');
  const parts = houses.filter((h) => h.type === 'cabin' || h.type === 'room');

  const collect = (h) => [
    ...getBlockedRanges(h.num).map((r) => ({ from: r.from, to: r.to, source: 'manual', origin: h.num })),
    ...getBookedRanges(h.num).map((r) => ({ ...r, origin: h.num })),
  ];

  if (target.type === 'whole') {
    return parts.flatMap(collect);
  }
  if (whole && Number(whole.num) !== Number(num)) {
    return collect(whole);
  }
  return [];
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(resolve(root, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/config', (req, res) => {
  const publicBase = publicSiteUrl(req);

  res.json({
    siteName: process.env.SITE_NAME || 'Жемчужина-Тараная',
    sitePhone: process.env.SITE_PHONE || '',
    siteEmail: process.env.SITE_EMAIL || '',
    maxChannelUrl: process.env.MAX_CHANNEL_URL || '',
    pricePerNight: DEFAULT_PRICE_PER_NIGHT,
    publicUrl: publicBase || null,
  });
});

function listingLabel(house) {
  if (!house) return '';
  if (house.title) return house.title;
  if (house.type === 'room') return `Гостевой номер № ${house.num}`;
  if (house.type === 'whole') return 'Аренда всей базы';
  return `Домик № ${house.num}`;
}

function buildYooKassaReceipt({ amount, house, checkIn, checkOut, guestEmail }) {
  if (!guestEmail || process.env.YOOKASSA_SEND_RECEIPT === 'false') return null;

  return {
    customer: { email: guestEmail },
    items: [
      {
        description: `${listingLabel(house)}, ${checkIn} — ${checkOut}`.slice(0, 128),
        quantity: '1.00',
        amount: { value: Number(amount).toFixed(2), currency: 'RUB' },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      },
    ],
  };
}

app.post('/api/booking/pay', async (req, res) => {
  try {
    const { houseNumber, checkIn, checkOut, guestName, guestPhone, guestEmail, guests, consent } = req.body;

    if (!houseNumber || !checkIn || !checkOut || !guestName || !guestPhone || !guestEmail) {
      return res.status(400).json({ ok: false, error: 'Заполните все обязательные поля, включая email' });
    }
    if (!consent) {
      return res.status(400).json({ ok: false, error: 'Требуется согласие на обработку персональных данных' });
    }

    const house = getHouse(houseNumber);
    if (!house) {
      return res.status(400).json({ ok: false, error: 'Такого варианта размещения нет' });
    }

    const ownRanges = [
      ...getBlockedRanges(houseNumber).map((r) => ({ from: r.from, to: r.to })),
      ...getBookedRanges(houseNumber),
    ];
    const conflicts = [...ownRanges, ...crossBlockedRangesFor(houseNumber)];
    const clash = conflicts.find((r) => rangesOverlap(checkIn, checkOut, r.from, r.to));
    if (clash) {
      return res.status(409).json({ ok: false, error: 'Эти даты уже заняты, выберите другие' });
    }

    const amount = calcAmount(houseNumber, checkIn, checkOut);
    const booking = createBooking({
      houseNumber,
      checkIn,
      checkOut,
      guestName,
      guestPhone,
      guestEmail: guestEmail || '',
      guests: guests || 2,
      amount,
    });

    const yookassa = new YooKassaClient({
      shopId: process.env.YOOKASSA_SHOP_ID,
      secretKey: process.env.YOOKASSA_SECRET_KEY,
    });

    const base = siteBase(req);
    const payment = await yookassa.createPayment({
      amount,
      description: `Бронь: ${listingLabel(house)}, ${checkIn} — ${checkOut}`,
      returnUrl: `${base}/booking-success.html?booking=${booking.id}`,
      metadata: { bookingId: booking.id },
      receipt: buildYooKassaReceipt({ amount, house, checkIn, checkOut, guestEmail }),
    });

    res.json({
      ok: true,
      paymentUrl: payment.confirmation?.confirmation_url,
      bookingId: booking.id,
      amount,
    });
  } catch (err) {
    console.error('[Booking]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/yookassa/webhook', async (req, res) => {
  try {
    const event = req.body?.event;
    const payment = req.body?.object;

    if (event !== 'payment.succeeded' || !payment?.metadata?.bookingId) {
      return res.json({ ok: true });
    }

    const booking = markBookingPaid(payment.metadata.bookingId, payment.id);
    if (!booking) return res.json({ ok: true });

    const notify = await notifyAdminAboutBooking(bookingToMaxPayload(booking));
    if (notify.sent?.length) {
      console.log('[Notify]', notify.sent.map((r) => r.channel).join(', '), '— бронь', booking.id);
    } else if (!notify.skipped) {
      console.warn('[Notify] Ошибки:', notify.errors);
    }

    const mail = await sendBookingReceiptEmail(booking);
    if (mail.sent) {
      console.log('[Email] Подтверждение отправлено на', booking.guestEmail);
    } else if (!mail.skipped) {
      console.warn('[Email] Ошибка:', mail.reason || mail);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[YooKassa webhook]', err.message);
    res.status(500).json({ ok: false });
  }
});

app.get('/api/booking/:id', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ ok: false });
  res.json({ ok: true, booking });
});

/* Public content */

app.get('/api/houses', (_req, res) => {
  res.json({ ok: true, houses: getHouses() });
});

app.get('/api/houses/:num', (req, res) => {
  const house = getHouse(req.params.num);
  if (!house) return res.status(404).json({ ok: false });
  res.json({ ok: true, house });
});

app.get('/api/reviews', (_req, res) => {
  res.json({ ok: true, reviews: getReviews() });
});

const REVIEW_SUBMIT_COOLDOWN_MS = 60 * 60 * 1000;
const reviewSubmitTimestamps = new Map();

function clientIp(req) {
  const fwd = req.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

app.post('/api/reviews', (req, res) => {
  const { author, text, rating, houseNum, consent } = req.body || {};
  const cleanAuthor = String(author || '').trim();
  const cleanText = String(text || '').trim();
  const cleanRating = Number(rating);
  const cleanHouseNum = houseNum ? Number(houseNum) : null;

  if (!consent) {
    return res.status(400).json({ ok: false, error: 'Отметьте согласие на публикацию' });
  }
  if (cleanAuthor.length < 2 || cleanAuthor.length > 60) {
    return res.status(400).json({ ok: false, error: 'Имя от 2 до 60 символов' });
  }
  if (cleanText.length < 20 || cleanText.length > 1500) {
    return res.status(400).json({ ok: false, error: 'Отзыв от 20 до 1500 символов' });
  }
  if (!Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
    return res.status(400).json({ ok: false, error: 'Оценка от 1 до 5' });
  }
  if (cleanHouseNum != null && (!Number.isInteger(cleanHouseNum) || !getHouse(cleanHouseNum))) {
    return res.status(400).json({ ok: false, error: 'Такого домика нет' });
  }

  const ip = clientIp(req);
  const last = reviewSubmitTimestamps.get(ip);
  const now = Date.now();
  if (last && now - last < REVIEW_SUBMIT_COOLDOWN_MS) {
    const minsLeft = Math.ceil((REVIEW_SUBMIT_COOLDOWN_MS - (now - last)) / 60000);
    return res.status(429).json({ ok: false, error: `Один отзыв в час. Попробуйте через ${minsLeft} мин.` });
  }
  reviewSubmitTimestamps.set(ip, now);

  const review = addReview({
    author: cleanAuthor,
    text: cleanText,
    rating: cleanRating,
    houseNum: cleanHouseNum,
    date: new Date().toISOString().slice(0, 10),
  });

  res.json({ ok: true, review });
});

app.get('/api/availability/:num', (req, res) => {
  const num = Number(req.params.num);
  if (!Number.isInteger(num)) return res.status(400).json({ ok: false });
  const manual = getBlockedRanges(num).map((r) => ({ from: r.from, to: r.to, source: 'manual' }));
  const booked = getBookedRanges(num);
  const cross = crossBlockedRangesFor(num);
  res.json({ ok: true, blocked: [...manual, ...booked, ...cross] });
});

/* Admin */

app.post('/api/admin/login', loginHandler);
app.post('/api/admin/logout', logoutHandler);
app.get('/api/admin/status', statusHandler);

app.put('/api/admin/houses/:num', requireAdmin, (req, res) => {
  const updated = updateHouse(req.params.num, req.body || {});
  if (!updated) return res.status(404).json({ ok: false });
  res.json({ ok: true, house: updated });
});

app.get('/api/admin/blocked-dates', requireAdmin, (_req, res) => {
  res.json({ ok: true, ranges: getBlockedRanges() });
});

app.post('/api/admin/blocked-dates', requireAdmin, (req, res) => {
  const { houseNum, from, to, reason } = req.body || {};
  if (!houseNum || !from || !to) return res.status(400).json({ ok: false, error: 'houseNum, from, to обязательны' });
  if (from > to) return res.status(400).json({ ok: false, error: 'Дата "до" раньше даты "от"' });
  const range = addBlockedRange({ houseNum, from, to, reason });
  res.json({ ok: true, range });
});

app.delete('/api/admin/blocked-dates/:id', requireAdmin, (req, res) => {
  const ok = deleteBlockedRange(req.params.id);
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

app.get('/api/admin/reviews', requireAdmin, (_req, res) => {
  res.json({ ok: true, reviews: getReviews() });
});

app.post('/api/admin/reviews', requireAdmin, (req, res) => {
  const review = addReview(req.body || {});
  res.json({ ok: true, review });
});

app.put('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const updated = updateReview(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false });
  res.json({ ok: true, review: updated });
});

app.get('/api/admin/bookings', requireAdmin, (_req, res) => {
  res.json({ ok: true, bookings: getAllBookings() });
});

app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const ok = deleteReview(req.params.id);
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

export function startServer() {
  return new Promise((resolveReady) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      const url = process.env.SITE_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      console.log(`Сайт: ${url}`);
      console.log(`Health: ${url.replace(/\/$/, '')}/api/health`);
      resolveReady(server);
    });
  });
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer();
}
