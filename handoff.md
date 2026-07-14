# Handoff — Жемчужина-Тараная

Self-orientation file for the assistant. Read this **first** when returning to the project. Update it after every material action so future-me can pick up cold.

---

## Snapshot (state of the project)
- Project: booking site for guest house complex «Жемчужина-Тараная», село Таранай, Сахалин.
- Stack: Node.js + Express, static frontend in `public/`, JSON files in `data/` as storage, YooKassa for payments, Render.com deploy config in `render.yaml`.
- Working directory: `C:\Users\Ваня\Desktop\123`.
- Related directory: `C:\Users\Ваня\Desktop\okay` (unclear if used — check before touching).

## Key files
| Path | Purpose |
|------|---------|
| `server.js` | Express server, all API endpoints, YooKassa integration, pricing + cross-block logic, security headers, per-page SSR routes for OG/canonical, `/robots.txt`, `/sitemap.xml` |
| `src/booking-store.js` | JSON persistence for bookings, `getBookedRanges` (paid + active pendings) |
| `src/content-store.js` | JSON persistence for houses, blocked-dates, reviews |
| `src/admin-auth.js` | Cookie-based admin sessions (persisted to `data/sessions.json`), per-IP login rate-limit, timing-safe password compare |
| `src/yookassa-client.js` | YooKassa REST wrapper — `createPayment` + `getPayment` (used by webhook to re-verify) |
| `src/yookassa-webhook.js` | CIDR check for YooKassa source IPs (v4 CIDRs + `2a02:5180::/32`) — used by `/api/yookassa/webhook` |
| `src/html-render.js` | Template helper: cached file read + `{{PLACEHOLDER}}` substitution with HTML escape (use `_RAW` suffix to skip escape, e.g. `JSONLD_RAW`) |
| `src/settings-store.js` | `data/settings.json` — site phones/email/MAX URL, edited via admin |
| `src/photo-store.js` | Handles admin base64 photo uploads → `public/images/uploads/` |
| `data/houses.json` | Source of truth for all listings (cabins, rooms, whole-base) |
| `data/blocked-dates.json` | Manual admin blocks |
| `data/bookings.json` | Bookings with status |
| `data/reviews.json` | Guest reviews |
| `data/sessions.json` | Persisted admin session tokens (gitignored via `data/*`) |
| `data/settings.json` | Editable site settings |
| `public/index.html` | Homepage — hero, listings grid, about, contacts. Server-rendered OG/JSON-LD |
| `public/house.html` | Listing detail + booking widget. Server-rendered per `?num=` |
| `public/booking.html` | Booking form + payment start. Includes hidden honeypot input |
| `public/policy.html` / `public/requisites.html` / `public/booking-success.html` | Static pages, `noindex` |
| `public/favicon.svg` | Inline SVG favicon (жемчужина) |
| `public/js/main.js` | Homepage rendering |
| `public/js/house.js` | Detail page + widget + availability |
| `public/js/booking.js` | Booking form logic |
| `public/js/policy.js` / `public/js/booking-success.js` | Tiny helper scripts extracted from inline `<script>` for strict CSP |
| `public/css/style.css` | All styles |
| `.env` / `.env.example` | Env vars — includes YooKassa keys, phones, MAX channel URL, security knobs |
| `render.yaml` | Render.com deploy blueprint |

## Data model (`data/houses.json`)
Each entry:
```
{ num, type, title?, guests, beds, pricePerNight, tags[], imgs[], description, amenities[] }
```
- `type`: `"cabin"` | `"room"` | `"whole"`.
- Frontend title: `h.title || 'Домик № ' + h.num`.
- Current listings: cabins 1–9 (5000₽), rooms 10–12 (3500₽, no photos yet), whole 100 (50000₽).

## Cross-block rules
`server.js:crossBlockedRangesFor(num)` — used by `/api/availability/:num` and `/api/booking/pay`.
- Book a cabin/room → whole-base becomes blocked for those dates.
- Book whole-base → all cabins + rooms blocked for those dates.
- Only `status === 'paid'` bookings block. Pending payments don't hold dates — pre-existing weakness.

---

## ✅ Done in prior sessions

### UI polish
- [x] Header **MAX** button restyled to solid `--ink` on both hero & scrolled states (`public/css/style.css:221-260`).
- [x] Header buttons + nav aligned on same baseline (padding/font-size unified, SVG icon capped at 14px).
- [x] Contacts section (`public/index.html`): added second phone `+8-914-758-08-82`, "Мы на 2ГИС" link, full street address.
- [x] Listings section subtitle updated to "9 домиков · 3 гостевых номера · аренда всей базы". `#houses-count` span removed (main.js null-checks).
- [x] Map iframe now uses actual base coordinates (142.436365, 46.631122) + red pin marker; placeholder note replaced with "Открыть на 2ГИС / Открыть на Яндекс.Картах" links.
- [x] Mobile hero fixes (`@media (max-width: 768px)`): reduced min-height 82vh → 72vh, softened top gradient so image shows through, background positioned at `center 35%`, title clamp lowered.
- [x] Swapped hero image from cabin-exterior shot to the sunset-over-sea photo (`public/images/hero.jpg` now holds a copy of `sea-sunset.jpg`). Reduced desktop top shade to `rgba(15,31,26,0.12)` so the orange sky reads through.
- [x] Homepage listings now render as **3 grouped cards** (main.js `renderGroupCard` / `renderSingleCard` / `bindGroupCard`): "Домики" with cabin picker (1–9), "Гостевые номера" with room picker (10–12), "Аренда всей базы" as a single card. Selector swaps cover image, guest count, price, and both link hrefs. Detail-page and per-listing booking flow unchanged.

### Images
- [x] Renamed useful photos from `pictures/` into `public/images/`: `room-1.jpg`, `room-2.jpg`, `bathroom.jpg`, `bbq.jpg`, `beach.jpg`, `sea-sunset.jpg`, `lake.jpg`.
- [x] Wired cabin interiors + bathroom + BBQ into each of the 9 cabin galleries.
- [x] Whole-base listing uses `overview.jpg`, `bbq.jpg`, `beach.jpg`, `sea-sunset.jpg`, `lake.jpg`.
- [x] Address photo (`pictures/123.jpg`) is NOT rendered; info from it (address, phone) is used in text.

### Business info baked into the site
- [x] Address updated in contacts to `Сахалинская обл., Анивский г.о., с. Таранай, ул. Первомайская, 17а`.
- [x] 2GIS listing URL wired into contacts.
- [x] MAX channel URL wired via `MAX_CHANNEL_URL` env var (`.env`), server exposes via `/api/config`, header button opens it in new tab.

### Pricing / listings overhaul (Option B)
- [x] Added `type`, `pricePerNight`, `title` fields to `data/houses.json` schema.
- [x] Added listings 10–12 (guest rooms in main house, 3500₽) and 100 (whole base, 50000₽).
- [x] Cabin default price changed 6000 → 5000₽.
- [x] `server.js`: `priceForHouse()`, `calcAmount(houseNumber, checkIn, checkOut)`, `crossBlockedRangesFor()`, `listingLabel()`, `listingLabel()`-based receipt/description.
- [x] `/api/booking/pay` validates the house exists and rejects with `409` on any own- or cross-blocked overlap.
- [x] `/api/availability/:num` includes cross-blocked ranges.
- [x] `src/content-store.js:updateHouse` allowlist extended (`pricePerNight`, `title`, `type`).
- [x] `public/js/main.js`: cards use `h.title` + `h.pricePerNight`. Review form dropdown hides `type === 'whole'`.
- [x] `public/js/house.js`: detail page + widget use per-house price + title.
- [x] `public/js/booking.js`: rewrote to load listings from `/api/houses`; dropdown shows "Title — X ₽/ночь"; guest max updates per-selection.
- [x] `public/booking.html`: dropped hardcoded `max="12"` on guests input.
- [x] `.env` + `render.yaml`: `BOOKING_PRICE_PER_NIGHT=5000`.
- [x] `render.yaml`: added `MAX_CHANNEL_URL` (sync=false — set in Render dashboard).

### Guest room photos
- [x] Rooms 10, 11, 12 have `imgs: []` — grid shows "Фото скоро" placeholder. User confirmed the interior photos we had were cabin interiors, not the main-house rooms.

### Security hardening (session 2026-07-14)
- [x] **YooKassa webhook** (`server.js` + `src/yookassa-webhook.js` + `src/yookassa-client.js`):
  - Reject request if source IP not in YooKassa's published ranges: `185.71.76.0/27`, `185.71.77.0/27`, `77.75.153.0/25`, `77.75.154.128/25`, `77.75.156.11`, `77.75.156.35`, `2a02:5180::/32`. Handles `::ffff:` v4-mapped v6 too.
  - Re-fetch payment via `YooKassaClient.getPayment(id)` and verify `status === 'succeeded'`, `paid === true`, `metadata.bookingId` matches, and `amount.value` matches booking's stored amount (±0.01 RUB). Only then `markBookingPaid`.
  - Bypass IP check with `YOOKASSA_WEBHOOK_SKIP_IP_CHECK=true` for local debugging (never set in prod).
- [x] **Booking spam** (`server.js`):
  - Honeypot hidden input `<input name="website">` in `booking.html` (positioned off-screen). Server rejects `400` if filled.
  - Per-IP rate limit on `/api/booking/pay`: 5 pending bookings per 30 min → `429`. Overridable via `BOOKING_RATE_LIMIT` env.
- [x] **Admin login** (`src/admin-auth.js`):
  - Sessions persisted to `data/sessions.json` (loaded once at boot, rewritten on login/logout/prune). Survives restart and multi-instance deploys.
  - Per-IP rate-limit on `/api/admin/login`: after `ADMIN_LOGIN_MAX_ATTEMPTS` (default 5) failed attempts within `ADMIN_LOGIN_WINDOW_MINUTES` (default 15) the IP is locked out for `ADMIN_LOGIN_LOCKOUT_MINUTES` (default 15) → `429`. Successful login clears the counter.
  - Password comparison via `crypto.timingSafeEqual` with length-safe branch (closes timing side-channel).
- [x] **HTTP security headers** (middleware in `server.js`):
  - `Content-Security-Policy`: `script-src 'self'` (no inline JS anywhere — extracted the last 2 inline scripts into `/js/policy.js` and `/js/booking-success.js`). `style-src 'self' 'unsafe-inline' fonts.googleapis.com` (unsafe-inline kept because `main.js`/`house.js` set `style="background-image:..."` via `innerHTML`). `frame-src` limited to `yandex.ru` for the map. `frame-ancestors 'none'` blocks clickjacking. `form-action 'self'`, `object-src 'none'`, `base-uri 'self'`, `upgrade-insecure-requests`.
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` — set **only** when `NODE_ENV=production`.
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### SEO + social previews (session 2026-07-14)
- [x] **Per-page SSR routes** in `server.js` before `express.static`: `/` + `/index.html`, `/booking.html`, `/policy.html`, `/requisites.html`, `/house.html`. Each uses `renderHtml()` from `src/html-render.js` to substitute `{{CANONICAL}}`, `{{OG_URL}}`, `{{OG_IMAGE}}` etc. Any unfilled placeholder is stripped so template artifacts never leak. Absolute URLs derived from `SITE_PUBLIC_URL` (env) → `RENDER_EXTERNAL_URL` → request host.
- [x] **Open Graph + Twitter Card + canonical + favicon** added to `index.html`, `booking.html`, `house.html`, `policy.html`, `requisites.html`, `booking-success.html`. Homepage OG image is `/images/sea-sunset.jpg`.
- [x] **`house.html` is now dynamic**: title/description/`og:image` pulled from the listing by `?num=`. Unknown `?num=` gets `noindex,follow` + canonical → `/`.
- [x] **JSON-LD `LodgingBusiness`** on `index.html`: address, geo (46.631122, 142.436365), phones from settings, email, priceRange (min–max from `houses.json`), all photos absolute, `AggregateRating` computed from `reviews.json`, `hasMap` → Yandex, `checkinTime: 14:00`, `checkoutTime: 12:00`.
- [x] **`/robots.txt`** — dynamic: `Allow: /`, `Disallow: /admin.html`, `Disallow: /api/`, `Sitemap: <base>/sitemap.xml`.
- [x] **`/sitemap.xml`** — dynamic: `/`, `/booking.html`, `/house.html?num=X` for every entry in `houses.json`, `/policy.html`, `/requisites.html`. `<lastmod>` from `houses.json` mtime.
- [x] **`noindex` on non-SEO pages**: `policy.html`, `requisites.html`, `booking-success.html`.
- [x] **Favicon**: `public/favicon.svg` (inline SVG жемчужина).

---

## ⛔ Not done / open loops

### For the user to do
- [ ] **Take actual photos of the 3 guest rooms in the main house** and drop `.jpg` files (not `.mhtml`) into `pictures/`. Then update the assistant to wire them into listings 10, 11, 12.
- [ ] **Deploy to Render + connect a domain** (see checklist below).
- [ ] **YooKassa**: switch from test keys (`test_*` in `.env`) to production keys before going live. Register webhook URL `<domain>/api/yookassa/webhook` with event `payment.succeeded`.
- [ ] **Admin password**: `.env` has empty `ADMIN_PASSWORD`. Set it before deploying so `/admin.html` is accessible.
- [ ] **SMTP password**: `.env` has empty `SMTP_PASS`. Set a Gmail app password to enable booking confirmation emails.
- [ ] **Notify channel**: currently `NOTIFY_VIA=off` in `.env`. Pick `vk` / `max` / `sms` and fill the relevant token before going live if admin notifications are wanted.

### For a future session
- [x] **Admin UI for price / title / type** — done. `public/js/admin.js:renderHouses` now has Type dropdown (cabin/room/whole), Price per night input, Title input. Summary line shows display name + price. Blocked-dates/reviews/bookings labels use `houseDisplayName()` helper.
- [x] **Booking actions** — `POST /api/admin/bookings` (offline paid booking, with overlap check), `POST /api/admin/bookings/:id/mark-paid`, `POST /api/admin/bookings/:id/cancel`, `DELETE /api/admin/bookings/:id`. Store helpers in `src/booking-store.js`: `updateBooking`, `deleteBooking`. New status: `cancelled` (+ filter button + card styling). Cards get action buttons in footer.
- [x] **Mini stats panel** — above bookings list, computed client-side from `state.bookings`: month revenue, total revenue, count paid/pending/cancelled, upcoming stays.
- [x] **Site settings** — `data/settings.json` via `src/settings-store.js`. `/api/config` uses settings then falls back to env (`SITE_PHONE`, `SITE_EMAIL`, `MAX_CHANNEL_URL`). Admin tab "Настройки" with sitePhone / sitePhoneSecondary / siteEmail / maxChannelUrl. Second phone on index.html now has `data-site-phone-secondary` + line hides if empty.
- [x] **Booking-card CSS** — was missing entirely; added `booking-card`, `booking-card__*`, `booking-card__status--{paid,pending,cancelled}`, plus `bookings-toolbar`, `bookings-filter`, `admin-stats`, `admin-stat`, `admin-form--collapsible` styles in `public/css/admin.css`.
- [x] **Unified header** across `index.html` / `booking.html` / `house.html` — same DOM (logo + nav + MAX + CTA + burger). Non-home pages use `.header--compact` (sticky, cream, ink text). CTA label differs per page ("Забронировать" / "На главную" / "Забронировать"). New `public/js/site-header.js` populates `data-site-*` attrs and wires burger toggle — loaded on booking/house before their own script. Killed `.header--compact .btn--ghost` size override.
- [x] **Photo drag-and-drop** — `src/photo-store.js` writes base64 uploads to `public/images/uploads/` (path in .gitignore). Endpoints: `POST /api/admin/houses/:num/photos` (batch, 30mb JSON limit), `DELETE /api/admin/houses/:num/photos` (also removes file if under `/images/uploads/`), `PUT /api/admin/houses/:num/photos/reorder`. Admin form textarea replaced with thumbnail grid + drop zone; drag-to-reorder + click-to-delete. First tile shows «Обложка» badge. Form save no longer sends imgs — managed via photo endpoints.
- [x] **Calendar view** — new admin tab «Календарь». One-month grid, rows = houses (sorted by num), cols = days. Cell states: paid (green), hold (copper), manual block (grey), cross-block (hatched). Cross-block rules mirrored client-side (whole ↔ cabin/room). Prev/next/today nav. Sticky first column + first row for horizontal scroll on mobile.
- [x] **Pending-hold logic** — `src/booking-store.js` now holds `pending` bookings for `BOOKING_HOLD_MINUTES` (env, default 30). `loadAndSweep()` lazily marks stale pendings as `expired` on read. `getBookedRanges` returns active pendings with `source: 'hold'`. New `expired` status wired into admin: filter button, stat counter, muted card style, mark-paid + delete still allowed.
- [x] **Homepage «Локация» strip** — new `.section-location` between amenities and reviews. 3 photos (sea-sunset wide, beach, lake) with caption overlay. Added to reveal-on-scroll targets in main.js.
- [x] **Guests input on house widget** — `initWidget(house)` now sets `max` from `house.guests` and clamps on `change`.
- [x] **`houses-count`** — grep clean; only main.js uses it with null-check. Fine to leave.

---

## Deployment checklist (Render + domain)

The project ships with `render.yaml` — it's a Render Blueprint.

1. **Push the code to a git repo** (GitHub / GitLab). Nothing in `.env` should be committed — verify `.gitignore` covers it.
2. On Render dashboard: **New → Blueprint → connect the repo**. Render reads `render.yaml` and creates the web service.
3. In the Render service's **Environment** tab, fill values for the vars marked `sync: false`:
   - `NODE_ENV=production` — **required**, otherwise HSTS header isn't sent and template caching is disabled.
   - `SITE_PUBLIC_URL` = `https://<your-domain>` (set after step 4, then redeploy). **Critical for SEO** — all canonical/OG/sitemap URLs derive from this. If unset, server falls back to `RENDER_EXTERNAL_URL` → request host.
   - `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` — production keys from YooKassa
   - `SITE_PHONE`, `SITE_EMAIL`
   - `MAX_CHANNEL_URL`
   - `VK_ACCESS_TOKEN`, `VK_ADMIN_PEER_ID` (if using VK notify) — otherwise set `NOTIFY_VIA=off`
   - `ADMIN_PASSWORD`
   - `SMTP_PASS`
   - Optional security knobs (all have safe defaults):
     - `BOOKING_RATE_LIMIT` (default 5) — pending bookings per IP per 30 min
     - `ADMIN_LOGIN_MAX_ATTEMPTS` (5), `ADMIN_LOGIN_WINDOW_MINUTES` (15), `ADMIN_LOGIN_LOCKOUT_MINUTES` (15)
     - `BOOKING_HOLD_MINUTES` (30) — how long a `pending` booking blocks dates
     - `YOOKASSA_WEBHOOK_SKIP_IP_CHECK` — **never set in prod**; bypasses webhook IP whitelist
4. **Domain**:
   - Buy on reg.ru / nic.ru / any registrar.
   - In Render → Settings → Custom Domains → Add. Render gives DNS records (A / CNAME) to add at the registrar.
   - Wait for DNS propagation + TLS cert (Render provisions Let's Encrypt automatically).
5. **YooKassa webhook**: in your YooKassa merchant cabinet, register the URL `https://<your-domain>/api/yookassa/webhook` for `payment.succeeded`. YooKassa's own IPs are whitelisted server-side — nothing else needs to be done.
6. **Smoke test**: hit `https://<your-domain>/api/health` → should return `{ ok: true, uptime: ... }`.
7. **SEO submission**:
   - Yandex.Webmaster → добавить сайт → скормить `https://<your-domain>/sitemap.xml`.
   - Google Search Console → same.
   - Проверить превью в мессенджерах: https://cards-dev.twitter.com/validator, https://developers.facebook.com/tools/debug/ (Telegram/VK/WhatsApp читают тот же OG).
   - Обновить карточку в Yandex Business / 2ГИС (URL, фото, часы).

If they want a Russian host instead of Render, the same env-var + webhook flow applies on Timeweb Cloud / Selectel / Yandex Cloud, using the Dockerfile in the repo.

---

## How to update this file
- After every material change: check off the "Done" item or add a new one, remove stale "Open loops", update "Snapshot" if data model changed.
- Keep to concrete facts: file paths, function names, env var names. Avoid vague plans.
- Commit style: append notes at the bottom of the relevant section, don't rewrite unrelated parts.
