import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve('data');

function fileFor(name) {
  return resolve(DATA_DIR, `${name}.json`);
}

function readJson(name, fallback) {
  const file = fileFor(name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(fileFor(name), JSON.stringify(data, null, 2), 'utf8');
}

/* Houses */

export function getHouses() {
  return readJson('houses', []);
}

export function getHouse(num) {
  return getHouses().find((h) => Number(h.num) === Number(num)) || null;
}

export function updateHouse(num, patch) {
  const houses = getHouses();
  const idx = houses.findIndex((h) => Number(h.num) === Number(num));
  if (idx === -1) return null;
  const allowed = ['guests', 'beds', 'tags', 'imgs', 'description', 'amenities', 'pricePerNight', 'title', 'type'];
  for (const key of allowed) {
    if (key in patch) houses[idx][key] = patch[key];
  }
  writeJson('houses', houses);
  return houses[idx];
}

/* Blocked dates */

export function getBlockedRanges(houseNum) {
  const all = readJson('blocked-dates', []);
  if (houseNum == null) return all;
  return all.filter((r) => Number(r.houseNum) === Number(houseNum));
}

export function addBlockedRange({ houseNum, from, to, reason = '' }) {
  const all = readJson('blocked-dates', []);
  const id = `BD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const range = { id, houseNum: Number(houseNum), from, to, reason, createdAt: new Date().toISOString() };
  all.push(range);
  writeJson('blocked-dates', all);
  return range;
}

export function deleteBlockedRange(id) {
  const all = readJson('blocked-dates', []);
  const next = all.filter((r) => r.id !== id);
  const removed = next.length !== all.length;
  if (removed) writeJson('blocked-dates', next);
  return removed;
}

/* Reviews */

export function getReviews() {
  return readJson('reviews', []);
}

export function addReview({ author, houseNum, date, rating, text }) {
  const all = getReviews();
  const id = `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const review = {
    id,
    author: String(author || '').trim(),
    houseNum: houseNum ? Number(houseNum) : null,
    date: date || new Date().toISOString().slice(0, 10),
    rating: Math.max(1, Math.min(5, Number(rating) || 5)),
    text: String(text || '').trim(),
  };
  all.push(review);
  writeJson('reviews', all);
  return review;
}

export function updateReview(id, patch) {
  const all = getReviews();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const allowed = ['author', 'houseNum', 'date', 'rating', 'text'];
  for (const key of allowed) {
    if (key in patch) all[idx][key] = patch[key];
  }
  writeJson('reviews', all);
  return all[idx];
}

export function deleteReview(id) {
  const all = getReviews();
  const next = all.filter((r) => r.id !== id);
  const removed = next.length !== all.length;
  if (removed) writeJson('reviews', next);
  return removed;
}
