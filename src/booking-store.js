import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve('data', 'bookings.json');

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
  return Object.values(load()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
  const all = load();
  const num = Number(houseNum);
  return Object.values(all)
    .filter((b) => b.status === 'paid' && Number(b.houseNumber) === num && b.checkIn && b.checkOut)
    .map((b) => ({ from: b.checkIn, to: b.checkOut, source: 'booking', bookingId: b.id }));
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
