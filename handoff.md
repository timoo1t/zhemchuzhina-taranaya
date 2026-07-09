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
| `server.js` | Express server, all API endpoints, YooKassa integration, pricing + cross-block logic |
| `src/booking-store.js` | JSON persistence for bookings, `getBookedRanges` (paid-only) |
| `src/content-store.js` | JSON persistence for houses, blocked-dates, reviews |
| `data/houses.json` | Source of truth for all listings (cabins, rooms, whole-base) |
| `data/blocked-dates.json` | Manual admin blocks |
| `data/bookings.json` | Bookings with status |
| `public/index.html` | Homepage — hero, listings grid, about, contacts |
| `public/house.html` | Listing detail + booking widget |
| `public/booking.html` | Booking form + payment start |
| `public/js/main.js` | Homepage rendering |
| `public/js/house.js` | Detail page + widget + availability |
| `public/js/booking.js` | Booking form logic |
| `public/css/style.css` | All styles |
| `.env` / `.env.example` | Env vars — includes YooKassa keys, phones, MAX channel URL |
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
- [ ] **Admin UI for price / title / type** — API already accepts them via `updateHouse`, but `public/admin.html` doesn't have inputs for them.
- [ ] **Pending-hold logic** — booking-store's `getBookedRanges` only reserves dates after payment webhook fires. Race window during payment flow. Fix: also reserve `status === 'pending'` for N minutes, expire stale pendings.
- [ ] **Server-side overlap validation exists for booking creation** but relies on `paid` status only. Same race applies.
- [ ] **Homepage placement of beach/sea/lake photos** — currently only used in the whole-base gallery. Consider a "Локация" strip on the homepage.
- [ ] **Guests input on house detail widget** — has no `max` attribute; frontend doesn't clamp to `house.guests`. `booking.js` clamps on the booking form only.
- [ ] **`houses-count` element removed** — if any other code touches it (grep clean), safe to ignore.

---

## Deployment checklist (Render + domain)

The project ships with `render.yaml` — it's a Render Blueprint.

1. **Push the code to a git repo** (GitHub / GitLab). Nothing in `.env` should be committed — verify `.gitignore` covers it.
2. On Render dashboard: **New → Blueprint → connect the repo**. Render reads `render.yaml` and creates the web service.
3. In the Render service's **Environment** tab, fill values for the vars marked `sync: false`:
   - `SITE_PUBLIC_URL` = `https://<your-domain>` (set after step 4, then redeploy)
   - `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` — production keys from YooKassa
   - `SITE_PHONE`, `SITE_EMAIL`
   - `MAX_CHANNEL_URL`
   - `VK_ACCESS_TOKEN`, `VK_ADMIN_PEER_ID` (if using VK notify) — otherwise set `NOTIFY_VIA=off`
   - `ADMIN_PASSWORD`
   - `SMTP_PASS`
4. **Domain**:
   - Buy on reg.ru / nic.ru / any registrar.
   - In Render → Settings → Custom Domains → Add. Render gives DNS records (A / CNAME) to add at the registrar.
   - Wait for DNS propagation + TLS cert (Render provisions Let's Encrypt automatically).
5. **YooKassa webhook**: in your YooKassa merchant cabinet, register the URL `https://<your-domain>/api/yookassa/webhook` for `payment.succeeded`.
6. **Smoke test**: hit `https://<your-domain>/api/health` → should return `{ ok: true, uptime: ... }`.

If they want a Russian host instead of Render, the same env-var + webhook flow applies on Timeweb Cloud / Selectel / Yandex Cloud, using the Dockerfile in the repo.

---

## How to update this file
- After every material change: check off the "Done" item or add a new one, remove stale "Open loops", update "Snapshot" if data model changed.
- Keep to concrete facts: file paths, function names, env var names. Avoid vague plans.
- Commit style: append notes at the bottom of the relevant section, don't rewrite unrelated parts.
