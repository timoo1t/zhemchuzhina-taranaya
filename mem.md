# Session memory — Zhemchuzhina site

## Business info (from pictures/123.jpg address card)
- Name: База отдыха «Жемчужина-Тараная» / Таранай (гостевой дом on 2GIS)
- Address: **ул. Первомайская, 17а, с. Таранай, Анивский г.о., Сахалинская область**
- Phone on the card: 89147580882 (RU domestic → +7 914 758 08 82). Also shown on site: +7 (906) 657-77-02.
- 2GIS listing rating: 4.8 (10 оценок)
- The address photo is NOT rendered on the site — only the info is used.
- 2GIS URL wired into the contacts section (opens in a new tab).
- MAX channel URL: `https://max.ru/join/0S6ryNEMAxk-V7ckTlMwnRNTmiDx-2noAsHJv7tGAuQ` — stored in `.env` as `MAX_CHANNEL_URL`.

## Listings & pricing model
Data source: `data/houses.json`. Each entry now has `type` and `pricePerNight`.

| num  | type  | title                    | price/night |
|------|-------|--------------------------|-------------|
| 1–9  | cabin | Домик № N                | 5000₽       |
| 10   | room  | Гостевой номер № 1       | 3500₽       |
| 11   | room  | Гостевой номер № 2       | 3500₽       |
| 12   | room  | Гостевой номер № 3       | 3500₽       |
| 100  | whole | Аренда всей базы         | 50000₽      |

- Server default fallback price: `BOOKING_PRICE_PER_NIGHT` in `.env` (5000₽).
- Detail-page widget and booking form read `pricePerNight` per listing.
- YooKassa amount + description use the selected listing's price + title.

## Cross-block availability rules
Implemented in `server.js:crossBlockedRangesFor`. `/api/availability/:num` and `/api/booking/pay` both apply it:
- Booking a cabin or room automatically blocks the "whole" listing for those dates.
- Booking the "whole" listing blocks every cabin + room for those dates.
- Whole-complex listing has `num=100`. Uses same booking/availability endpoints as any other listing.
- Note: `getBookedRanges` filters by `status === 'paid'` — pending payments do NOT block anything until the YooKassa webhook fires. Pre-existing behavior, unchanged.

## Data model fields
- `num` (int) — id, used in URLs (`/house.html?num=N`) and API.
- `type` — `"cabin"` | `"room"` | `"whole"`.
- `title` — optional display name; when absent, frontend falls back to `Домик № {num}`.
- `pricePerNight` — required per entry.
- `guests`, `beds`, `tags`, `imgs`, `description`, `amenities` — unchanged semantics.
- `content-store.js:updateHouse` allows admin patches of `pricePerNight`, `title`, `type` in addition to previous fields.

## Photo library in /public/images
- `hero.jpg`, `overview.jpg`, `house-1.jpg` … `house-9.jpg` — existing exteriors.
- `room-1.jpg`, `room-2.jpg` — interior beds/wooden walls.
- `bathroom.jpg` — shower + sink.
- `bbq.jpg` — mangal area with tables, benches, fire pit.
- `beach.jpg`, `sea-sunset.jpg`, `lake.jpg` — vibe shots. Currently used only on the whole-complex listing gallery.

## Header MAX button (earlier work)
`public/css/style.css:221-260` — `.header__max` is solid `--ink` on both hero & scrolled states; padding/font-size unified with `.header__cta`; SVG icon 14px so text baselines align.

## Outstanding / handoffs to user
- 6 `.mhtml` files in `pictures/` (saved 2GIS pages) are NOT usable as images. User should save individual JPGs of the main-house/complex photos and drop them into `pictures/`, then I'll wire them in.
- Beach/sea/lake photos not on the homepage; currently only appear on the "whole base" listing gallery.
