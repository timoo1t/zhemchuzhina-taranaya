import './src/load-env.js';
import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as statSyncMod from 'node:fs';
import { root } from './src/load-env.js';
import { YooKassaClient } from './src/yookassa-client.js';
import {
  createBooking,
  getBooking,
  markBookingPaid,
  bookingToMaxPayload,
  getBookedRanges,
  getAllBookings,
  updateBooking,
  deleteBooking,
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
import { getSettings, updateSettings } from './src/settings-store.js';
import { savePhoto, deletePhotoFile } from './src/photo-store.js';
import { isYookassaIp, extractRequestIp } from './src/yookassa-webhook.js';
import { renderHtml } from './src/html-render.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.set('etag', false);

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

function findDateConflict(houseNumber, checkIn, checkOut, { ignoreBookingId } = {}) {
  const own = [
    ...getBlockedRanges(houseNumber).map((r) => ({ from: r.from, to: r.to })),
    ...getBookedRanges(houseNumber).filter((r) => r.bookingId !== ignoreBookingId),
  ];
  const conflicts = [...own, ...crossBlockedRangesFor(houseNumber)];
  return conflicts.find((r) => rangesOverlap(checkIn, checkOut, r.from, r.to)) || null;
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

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://yandex.ru https://*.yandex.ru",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

const SITE_ADDRESS = {
  streetAddress: 'ул. Первомайская, 17а',
  addressLocality: 'с. Таранай',
  addressRegion: 'Сахалинская область',
  postalCode: '694015',
  addressCountry: 'RU',
};
const SITE_GEO = { latitude: 46.631122, longitude: 142.436365 };
const DEFAULT_OG_IMAGE_PATH = '/images/sea-sunset.jpg';
const HOUSES_JSON_PATH = resolve(root, 'data', 'houses.json');
const REVIEWS_JSON_PATH = resolve(root, 'data', 'reviews.json');

function buildLodgingJsonLd(base) {
  const houses = getHouses();
  const s = getSettings();
  const phones = [
    s.sitePhone || process.env.SITE_PHONE,
    s.sitePhoneSecondary,
  ].filter(Boolean);
  const prices = houses.map((h) => Number(h.pricePerNight) || DEFAULT_PRICE_PER_NIGHT);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const photoUrls = [...new Set(houses.flatMap((h) => h.imgs || []))].map((u) => `${base}${u}`);

  const reviews = getReviews();
  const validRatings = reviews.map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
  const aggregateRating = validRatings.length
    ? {
        '@type': 'AggregateRating',
        ratingValue: (validRatings.reduce((a, b) => a + b, 0) / validRatings.length).toFixed(2),
        reviewCount: validRatings.length,
        bestRating: '5',
        worstRating: '1',
      }
    : null;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: 'Жемчужина-Тараная',
    description:
      '9 модульных домиков и 3 гостевых номера на берегу Анивского залива в селе Таранай. Мангал, баня, пляж.',
    url: `${base}/`,
    image: photoUrls.length ? photoUrls : [`${base}${DEFAULT_OG_IMAGE_PATH}`],
    telephone: phones,
    email: s.siteEmail || process.env.SITE_EMAIL || undefined,
    priceRange: `${minPrice}–${maxPrice} RUB`,
    address: { '@type': 'PostalAddress', ...SITE_ADDRESS },
    geo: { '@type': 'GeoCoordinates', ...SITE_GEO },
    hasMap: 'https://yandex.ru/maps/?ll=142.436365%2C46.631122&z=16',
    checkinTime: '14:00',
    checkoutTime: '12:00',
  };
  if (aggregateRating) jsonld.aggregateRating = aggregateRating;
  return jsonld;
}

function pageUrl(req, pathname) {
  return `${siteBase(req)}${pathname}`;
}

function firstAbsoluteImage(base, imgs) {
  const first = imgs?.find(Boolean);
  return first ? `${base}${first}` : `${base}${DEFAULT_OG_IMAGE_PATH}`;
}

app.get(['/', '/index.html'], (req, res) => {
  const base = siteBase(req);
  renderHtml(res, resolve(root, 'public/index.html'), {
    CANONICAL: `${base}/`,
    OG_URL: `${base}/`,
    OG_IMAGE: `${base}${DEFAULT_OG_IMAGE_PATH}`,
    JSONLD_RAW: JSON.stringify(buildLodgingJsonLd(base)),
  });
});

app.get('/booking.html', (req, res) => {
  const base = siteBase(req);
  renderHtml(res, resolve(root, 'public/booking.html'), {
    CANONICAL: `${base}/booking.html`,
    OG_URL: `${base}/booking.html`,
    OG_IMAGE: `${base}${DEFAULT_OG_IMAGE_PATH}`,
  });
});

app.get('/policy.html', (req, res) => {
  renderHtml(res, resolve(root, 'public/policy.html'), {
    CANONICAL: pageUrl(req, '/policy.html'),
  });
});

app.get('/requisites.html', (req, res) => {
  renderHtml(res, resolve(root, 'public/requisites.html'), {
    CANONICAL: pageUrl(req, '/requisites.html'),
  });
});

app.get('/house.html', (req, res) => {
  const base = siteBase(req);
  const num = Number(req.query.num);
  const house = Number.isInteger(num) ? getHouse(num) : null;

  if (!house) {
    return renderHtml(res, resolve(root, 'public/house.html'), {
      TITLE: 'Домик не найден — Жемчужина-Тараная',
      DESCRIPTION: 'Такого домика у нас нет. Выберите другой вариант размещения.',
      OG_TITLE: 'Домик не найден — Жемчужина-Тараная',
      ROBOTS: 'noindex,follow',
      CANONICAL: `${base}/`,
      OG_URL: `${base}/house.html`,
      OG_IMAGE: `${base}${DEFAULT_OG_IMAGE_PATH}`,
    });
  }

  const label = listingLabel(house);
  const price = priceForHouse(house);
  const guests = house.guests || 1;
  const shortDesc =
    (house.description && house.description.trim()) ||
    `${label} — до ${guests} гостей, ${price} ₽/ночь. База отдыха «Жемчужина-Тараная», село Таранай, Сахалин.`;

  renderHtml(res, resolve(root, 'public/house.html'), {
    TITLE: `${label} — Жемчужина-Тараная`,
    DESCRIPTION: shortDesc.slice(0, 300),
    OG_TITLE: `${label} — ${price} ₽/ночь`,
    ROBOTS: 'index,follow',
    CANONICAL: `${base}/house.html?num=${house.num}`,
    OG_URL: `${base}/house.html?num=${house.num}`,
    OG_IMAGE: firstAbsoluteImage(base, house.imgs),
  });
});

app.get('/robots.txt', (req, res) => {
  const base = siteBase(req);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin.html',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(body);
});

app.get('/sitemap.xml', (req, res) => {
  const base = siteBase(req);
  const stat = existsSyncSafe(HOUSES_JSON_PATH) ? mtimeIsoSafe(HOUSES_JSON_PATH) : new Date().toISOString().slice(0, 10);
  const houses = getHouses();

  const urls = [
    { loc: `${base}/`, changefreq: 'weekly', priority: '1.0', lastmod: stat },
    { loc: `${base}/booking.html`, changefreq: 'weekly', priority: '0.9', lastmod: stat },
    ...houses.map((h) => ({
      loc: `${base}/house.html?num=${h.num}`,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: stat,
    })),
    { loc: `${base}/policy.html`, changefreq: 'yearly', priority: '0.2' },
    { loc: `${base}/requisites.html`, changefreq: 'yearly', priority: '0.2' },
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          '  <url>' +
          `<loc>${escapeXml(u.loc)}</loc>` +
          (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '') +
          (u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : '') +
          (u.priority ? `<priority>${u.priority}</priority>` : '') +
          '</url>'
      )
      .join('\n') +
    '\n</urlset>\n';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function existsSyncSafe(p) {
  try { return statSyncMod.existsSync(p); } catch { return false; }
}
function mtimeIsoSafe(p) {
  try { return statSyncMod.statSync(p).mtime.toISOString().slice(0, 10); } catch { return null; }
}

app.use(express.static(resolve(root, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/config', (req, res) => {
  const publicBase = publicSiteUrl(req);
  const s = getSettings();

  res.json({
    siteName: process.env.SITE_NAME || 'Жемчужина-Тараная',
    sitePhone: s.sitePhone || process.env.SITE_PHONE || '',
    sitePhoneSecondary: s.sitePhoneSecondary || '',
    siteEmail: s.siteEmail || process.env.SITE_EMAIL || '',
    maxChannelUrl: s.maxChannelUrl || process.env.MAX_CHANNEL_URL || '',
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

const BOOKING_RATE_WINDOW_MS = 30 * 60 * 1000;
const BOOKING_RATE_LIMIT = Number(process.env.BOOKING_RATE_LIMIT) || 5;
const bookingAttemptsByIp = new Map();

function checkBookingRateLimit(ip) {
  const now = Date.now();
  const cutoff = now - BOOKING_RATE_WINDOW_MS;
  const list = (bookingAttemptsByIp.get(ip) || []).filter((t) => t > cutoff);
  if (list.length >= BOOKING_RATE_LIMIT) {
    bookingAttemptsByIp.set(ip, list);
    return false;
  }
  list.push(now);
  bookingAttemptsByIp.set(ip, list);
  return true;
}

app.post('/api/booking/pay', async (req, res) => {
  try {
    const { houseNumber, checkIn, checkOut, guestName, guestPhone, guestEmail, guests, consent, website } = req.body;

    if (typeof website === 'string' && website.trim() !== '') {
      console.warn('[Booking] honeypot triggered from', clientIp(req));
      return res.status(400).json({ ok: false, error: 'Некорректный запрос' });
    }

    const ip = clientIp(req);
    if (!checkBookingRateLimit(ip)) {
      return res.status(429).json({ ok: false, error: 'Слишком много попыток. Попробуйте позже.' });
    }

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

    const clash = findDateConflict(houseNumber, checkIn, checkOut);
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
    const skipIpCheck = process.env.YOOKASSA_WEBHOOK_SKIP_IP_CHECK === 'true';
    const ip = extractRequestIp(req);
    if (!skipIpCheck && !isYookassaIp(ip)) {
      console.warn('[YooKassa webhook] Отклонён IP:', ip);
      return res.status(403).json({ ok: false });
    }

    const event = req.body?.event;
    const paymentId = req.body?.object?.id;
    const bookingId = req.body?.object?.metadata?.bookingId;

    if (event !== 'payment.succeeded' || !paymentId || !bookingId) {
      return res.json({ ok: true });
    }

    const pending = getBooking(bookingId);
    if (!pending) return res.json({ ok: true });

    const yookassa = new YooKassaClient({
      shopId: process.env.YOOKASSA_SHOP_ID,
      secretKey: process.env.YOOKASSA_SECRET_KEY,
    });
    const payment = await yookassa.getPayment(paymentId);

    if (payment.status !== 'succeeded' || !payment.paid) {
      console.warn('[YooKassa webhook] Платёж не подтверждён API:', paymentId, payment.status);
      return res.status(409).json({ ok: false });
    }
    if (payment.metadata?.bookingId !== bookingId) {
      console.warn('[YooKassa webhook] metadata.bookingId не совпадает:', paymentId);
      return res.status(409).json({ ok: false });
    }
    const paidAmount = Number(payment.amount?.value);
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(pending.amount)) > 0.01) {
      console.warn('[YooKassa webhook] Сумма не совпадает:', paymentId, paidAmount, 'ожидали', pending.amount);
      return res.status(409).json({ ok: false });
    }

    const booking = markBookingPaid(bookingId, paymentId);
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

const photoUploadJson = express.json({ limit: '30mb' });

app.post('/api/admin/houses/:num/photos', requireAdmin, photoUploadJson, (req, res) => {
  const house = getHouse(req.params.num);
  if (!house) return res.status(404).json({ ok: false });

  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!files.length) return res.status(400).json({ ok: false, error: 'Нет файлов' });
  if (files.length > 20) return res.status(400).json({ ok: false, error: 'Максимум 20 файлов за раз' });

  const newUrls = [];
  try {
    files.forEach((f, i) => newUrls.push(savePhoto(req.params.num, f.dataUrl, i)));
  } catch (err) {
    newUrls.forEach(deletePhotoFile);
    return res.status(400).json({ ok: false, error: err.message });
  }

  const updated = updateHouse(req.params.num, { imgs: [...(house.imgs || []), ...newUrls] });
  res.json({ ok: true, house: updated });
});

app.delete('/api/admin/houses/:num/photos', requireAdmin, (req, res) => {
  const house = getHouse(req.params.num);
  if (!house) return res.status(404).json({ ok: false });
  const url = req.body?.url;
  if (!url) return res.status(400).json({ ok: false, error: 'url обязателен' });
  const nextImgs = (house.imgs || []).filter((u) => u !== url);
  const updated = updateHouse(req.params.num, { imgs: nextImgs });
  deletePhotoFile(url);
  res.json({ ok: true, house: updated });
});

app.put('/api/admin/houses/:num/photos/reorder', requireAdmin, (req, res) => {
  const house = getHouse(req.params.num);
  if (!house) return res.status(404).json({ ok: false });
  const imgs = Array.isArray(req.body?.imgs) ? req.body.imgs : [];
  const current = house.imgs || [];
  if (imgs.length !== current.length || imgs.some((u) => !current.includes(u))) {
    return res.status(400).json({ ok: false, error: 'Список не совпадает с текущими фото' });
  }
  const updated = updateHouse(req.params.num, { imgs });
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

app.post('/api/admin/bookings', requireAdmin, (req, res) => {
  const { houseNumber, checkIn, checkOut, guestName, guestPhone, guestEmail, guests, amount, note } = req.body || {};
  if (!houseNumber || !checkIn || !checkOut || !guestName) {
    return res.status(400).json({ ok: false, error: 'houseNumber, checkIn, checkOut, guestName обязательны' });
  }
  if (checkIn >= checkOut) {
    return res.status(400).json({ ok: false, error: 'Дата выезда должна быть позже даты заезда' });
  }
  const house = getHouse(houseNumber);
  if (!house) return res.status(400).json({ ok: false, error: 'Такого варианта размещения нет' });

  const clash = findDateConflict(houseNumber, checkIn, checkOut);
  if (clash) return res.status(409).json({ ok: false, error: 'Эти даты уже заняты' });

  const finalAmount = Number(amount) > 0 ? Number(amount) : calcAmount(houseNumber, checkIn, checkOut);
  const now = new Date().toISOString();
  const booking = createBooking({
    houseNumber: Number(houseNumber),
    checkIn,
    checkOut,
    guestName: String(guestName).trim(),
    guestPhone: String(guestPhone || '').trim(),
    guestEmail: String(guestEmail || '').trim(),
    guests: Number(guests) || 1,
    amount: finalAmount,
    note: note ? String(note).trim() : '',
  });
  const paid = updateBooking(booking.id, { status: 'paid', paidAt: now, paymentId: `manual-${Date.now()}` });
  res.json({ ok: true, booking: paid });
});

app.post('/api/admin/bookings/:id/mark-paid', requireAdmin, (req, res) => {
  const existing = getBooking(req.params.id);
  if (!existing) return res.status(404).json({ ok: false });
  if (existing.status === 'paid') return res.json({ ok: true, booking: existing });

  const clash = findDateConflict(existing.houseNumber, existing.checkIn, existing.checkOut, { ignoreBookingId: existing.id });
  if (clash) return res.status(409).json({ ok: false, error: 'Даты пересекаются с другой бронью' });

  const updated = updateBooking(req.params.id, {
    status: 'paid',
    paidAt: new Date().toISOString(),
    paymentId: existing.paymentId || `manual-${Date.now()}`,
  });
  res.json({ ok: true, booking: updated });
});

app.post('/api/admin/bookings/:id/cancel', requireAdmin, (req, res) => {
  const existing = getBooking(req.params.id);
  if (!existing) return res.status(404).json({ ok: false });
  const updated = updateBooking(req.params.id, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  });
  res.json({ ok: true, booking: updated });
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const ok = deleteBooking(req.params.id);
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  const s = getSettings();
  res.json({
    ok: true,
    settings: {
      sitePhone: s.sitePhone || process.env.SITE_PHONE || '',
      sitePhoneSecondary: s.sitePhoneSecondary || '',
      siteEmail: s.siteEmail || process.env.SITE_EMAIL || '',
      maxChannelUrl: s.maxChannelUrl || process.env.MAX_CHANNEL_URL || '',
    },
    defaults: {
      sitePhone: process.env.SITE_PHONE || '',
      siteEmail: process.env.SITE_EMAIL || '',
      maxChannelUrl: process.env.MAX_CHANNEL_URL || '',
    },
  });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const updated = updateSettings(req.body || {});
  res.json({ ok: true, settings: updated });
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
