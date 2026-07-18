/*
 * Pure booking math + cross-block rules.
 *
 * Kept dependency-free (no store / fs / env access) so the money-path logic
 * is unit-testable in isolation. server.js wires the data sources in.
 */

export function nightsBetween(checkIn, checkOut) {
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  return Math.max(1, nights);
}

export function calcAmount(perNight, checkIn, checkOut) {
  return nightsBetween(checkIn, checkOut) * perNight;
}

export function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom < bTo && aTo > bFrom;
}

/*
 * Cross-block: booking a cabin/room blocks the whole-base listing and vice
 * versa. `collect(houseNum)` returns the occupied ranges for one listing —
 * server.js supplies it (manual blocks + paid/held bookings).
 */
export function crossBlockedRangesFor(num, houses, collect) {
  const target = houses.find((h) => Number(h.num) === Number(num));
  if (!target) return [];

  const whole = houses.find((h) => h.type === 'whole');
  const parts = houses.filter((h) => h.type === 'cabin' || h.type === 'room');

  if (target.type === 'whole') {
    return parts.flatMap((h) => collect(h.num));
  }
  if (whole && Number(whole.num) !== Number(num)) {
    return collect(whole.num);
  }
  return [];
}
