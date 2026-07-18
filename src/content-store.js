import { resolve } from 'node:path';
import { sanitizePlainText, sanitizeSingleLine } from './sanitize.js';
import { readJsonFile, writeJsonFile } from './json-file.js';

const DATA_DIR = resolve('data');

function fileFor(name) {
  return resolve(DATA_DIR, `${name}.json`);
}

function readJson(name, fallback) {
  return readJsonFile(fileFor(name), fallback);
}

function writeJson(name, data) {
  writeJsonFile(fileFor(name), data);
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
    if (!(key in patch)) continue;
    let value = patch[key];
    if (key === 'title') value = sanitizeSingleLine(value, { maxLen: 200 });
    else if (key === 'beds') value = sanitizeSingleLine(value, { maxLen: 200 });
    else if (key === 'description') value = sanitizePlainText(value, { maxLen: 3000 });
    else if (key === 'tags' && Array.isArray(value)) {
      value = value.map((t) => sanitizeSingleLine(t, { maxLen: 40 })).filter(Boolean).slice(0, 20);
    } else if (key === 'amenities' && Array.isArray(value)) {
      value = value.map((t) => sanitizeSingleLine(t, { maxLen: 80 })).filter(Boolean).slice(0, 40);
    }
    houses[idx][key] = value;
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
  const range = {
    id,
    houseNum: Number(houseNum),
    from,
    to,
    reason: sanitizeSingleLine(reason, { maxLen: 200 }),
    createdAt: new Date().toISOString(),
  };
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
    author: sanitizeSingleLine(author, { maxLen: 60 }),
    houseNum: houseNum ? Number(houseNum) : null,
    date: date || new Date().toISOString().slice(0, 10),
    rating: Math.max(1, Math.min(5, Number(rating) || 5)),
    text: sanitizePlainText(text, { maxLen: 1500 }),
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
    if (!(key in patch)) continue;
    let value = patch[key];
    if (key === 'author') value = sanitizeSingleLine(value, { maxLen: 60 });
    else if (key === 'text') value = sanitizePlainText(value, { maxLen: 1500 });
    else if (key === 'rating') value = Math.max(1, Math.min(5, Number(value) || 5));
    else if (key === 'houseNum') value = value ? Number(value) : null;
    all[idx][key] = value;
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
