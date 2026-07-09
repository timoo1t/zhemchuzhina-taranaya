import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve('data', 'bookings.json');

const PENDING_HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES) || 30;
const PENDING_HOLD_MS = PENDING_HOLD_MINUTES * 60 * 1000;

function load() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const dir = resolve('data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function isPendingActive(b, now = Date.now()) {
  if (b.status !== 'pending') return false;
  const createdAt = new Date(b.createdAt).getTime();
  return Number.isFinite(createdAt) && now - createdAt < PENDING_HOLD_MS;
}

function expireStalePendings(all) {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  let dirty = false;
  for (const b of Object.values(all)) {
    if (b.status !== 'pending') continue;
    const createdAt = new Date(b.createdAt).getTime();
    if (Number.isFinite(createdAt) && now - createdAt >= PENDING_HOLD_MS) {
      b.status = 'expired';
      b.expiredAt = iso;
      dirty = true;
    }
  }
  return dirty;
}

function loadAndSweep() {
  const all = load();
  if (expireStalePendings(all)) save(all);
  return all;
}

export function getPendingHoldMinutes() {
  return PENDING_HOLD_MINUTES;
}

export function createBooking(payload) {
  const id = `BR-${Date.now()}`;
  const all = load();
  all[id] = { id, status: 'pending', createdAt: new Date().toISOString(), ...payload };
  save(all);
  return all[id];
}

export function getBooking(id) {
  return load()[id] ?? null;
}

export function markBookingPaid(id, paymentId) {
  const all = load();
  if (!all[id]) return null;
  all[id].status = 'paid';
  all[id].paymentId = paymentId;
  all[id].paidAt = new Date().toISOString();
  save(all);
  return all[id];
}

export function getAllBookings() {
  return Object.values(loadAndSweep()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function updateBooking(id, patch) {
  const all = load();
  if (!all[id]) return null;
  const allowed = [
    'status', 'paidAt', 'paymentId', 'checkIn', 'checkOut',
    'guestName', 'guestPhone', 'guestEmail', 'guests', 'amount',
    'houseNumber', 'note', 'cancelledAt',
  ];
  for (const key of allowed) {
    if (key in patch) all[id][key] = patch[key];
  }
  save(all);
  return all[id];
}

export function deleteBooking(id) {
  const all = load();
  if (!all[id]) return false;
  delete all[id];
  save(all);
  return true;
}

export function getBookedRanges(houseNum) {
  const all = loadAndSweep();
  const num = Number(houseNum);
  const now = Date.now();
  return Object.values(all)
    .filter((b) => Number(b.houseNumber) === num && b.checkIn && b.checkOut)
    .filter((b) => b.status === 'paid' || isPendingActive(b, now))
    .map((b) => ({
      from: b.checkIn,
      to: b.checkOut,
      source: b.status === 'paid' ? 'booking' : 'hold',
      bookingId: b.id,
    }));
}

export function bookingToMaxPayload(booking) {
  return {
    houseNumber: booking.houseNumber,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    guestEmail: booking.guestEmail,
    amount: booking.amount,
    paid: booking.status === 'paid',
    bookingId: booking.id,
  };
}
