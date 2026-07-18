import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nightsBetween,
  calcAmount,
  rangesOverlap,
  crossBlockedRangesFor,
} from '../src/availability.js';

test('nightsBetween counts nights, min 1', () => {
  assert.equal(nightsBetween('2026-08-01', '2026-08-04'), 3);
  assert.equal(nightsBetween('2026-08-01', '2026-08-02'), 1);
  // same day / reversed never returns 0 or negative
  assert.equal(nightsBetween('2026-08-01', '2026-08-01'), 1);
  assert.equal(nightsBetween('2026-08-05', '2026-08-01'), 1);
});

test('calcAmount = nights * perNight', () => {
  assert.equal(calcAmount(5000, '2026-08-01', '2026-08-04'), 15000);
  assert.equal(calcAmount(3500, '2026-08-01', '2026-08-02'), 3500);
  assert.equal(calcAmount(50000, '2026-08-10', '2026-08-12'), 100000);
});

test('rangesOverlap: touching edges do not overlap (checkout == checkin)', () => {
  // one guest leaves 08-04, next arrives 08-04 → allowed
  assert.equal(rangesOverlap('2026-08-01', '2026-08-04', '2026-08-04', '2026-08-06'), false);
  assert.equal(rangesOverlap('2026-08-04', '2026-08-06', '2026-08-01', '2026-08-04'), false);
});

test('rangesOverlap: real overlaps detected', () => {
  assert.equal(rangesOverlap('2026-08-01', '2026-08-05', '2026-08-03', '2026-08-08'), true);
  assert.equal(rangesOverlap('2026-08-03', '2026-08-04', '2026-08-01', '2026-08-10'), true); // fully inside
});

// Cross-block fixtures
const HOUSES = [
  { num: 1, type: 'cabin' },
  { num: 2, type: 'cabin' },
  { num: 10, type: 'room' },
  { num: 100, type: 'whole' },
];
// each listing "occupied" range keyed by num
const OCC = {
  1: [{ from: '2026-08-01', to: '2026-08-03' }],
  2: [{ from: '2026-08-05', to: '2026-08-07' }],
  10: [{ from: '2026-08-10', to: '2026-08-11' }],
  100: [{ from: '2026-09-01', to: '2026-09-05' }],
};
const collect = (n) => OCC[n] || [];

test('cross-block: booking whole is blocked by any part booking', () => {
  const ranges = crossBlockedRangesFor(100, HOUSES, collect);
  // whole pulls in cabins 1,2 and room 10 (not itself)
  assert.deepEqual(
    ranges.map((r) => r.from).sort(),
    ['2026-08-01', '2026-08-05', '2026-08-10']
  );
});

test('cross-block: booking a cabin is blocked by the whole booking', () => {
  const ranges = crossBlockedRangesFor(1, HOUSES, collect);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].from, '2026-09-01');
});

test('cross-block: one cabin does NOT block another cabin/room directly', () => {
  // cabin 1 only sees the whole listing, never cabin 2 or room 10
  const ranges = crossBlockedRangesFor(1, HOUSES, collect);
  assert.ok(!ranges.some((r) => r.from === '2026-08-05')); // cabin 2's range absent
  assert.ok(!ranges.some((r) => r.from === '2026-08-10')); // room 10's range absent
});

test('cross-block: unknown listing → no ranges', () => {
  assert.deepEqual(crossBlockedRangesFor(999, HOUSES, collect), []);
});

test('cross-block: no whole listing present → parts have no cross-block', () => {
  const noWhole = HOUSES.filter((h) => h.type !== 'whole');
  assert.deepEqual(crossBlockedRangesFor(1, noWhole, collect), []);
});
