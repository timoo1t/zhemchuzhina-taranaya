import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from '../src/json-file.js';

function freshDir() {
  return mkdtempSync(join(tmpdir(), 'jsonfile-'));
}

test('first write creates file, no .bak yet', () => {
  const dir = freshDir();
  const f = join(dir, 'd.json');
  writeJsonFile(f, { a: 1 });
  assert.equal(existsSync(f), true);
  assert.equal(existsSync(`${f}.bak`), false);
  assert.deepEqual(readJsonFile(f), { a: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test('second write keeps previous version in .bak', () => {
  const dir = freshDir();
  const f = join(dir, 'd.json');
  writeJsonFile(f, { v: 1 });
  writeJsonFile(f, { v: 2 });
  assert.deepEqual(readJsonFile(f), { v: 2 });
  assert.deepEqual(readJsonFile(`${f}.bak`), { v: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test('read recovers from .bak when main file is corrupt', () => {
  const dir = freshDir();
  const f = join(dir, 'd.json');
  writeJsonFile(f, { v: 1 });
  writeJsonFile(f, { v: 2 }); // now .bak = {v:1}
  writeFileSync(f, '{ broken', 'utf8'); // corrupt main
  assert.deepEqual(readJsonFile(f, 'FALLBACK'), { v: 1 }); // recovered from .bak
  rmSync(dir, { recursive: true, force: true });
});

test('writing over a corrupt main file does not clobber the good .bak', () => {
  const dir = freshDir();
  const f = join(dir, 'd.json');
  writeJsonFile(f, { good: true }); // .bak absent
  writeJsonFile(f, { good: 2 }); // .bak = {good:true}
  writeFileSync(f, 'CORRUPT', 'utf8');
  writeJsonFile(f, { good: 3 }); // main is corrupt → backup skipped, .bak untouched
  assert.deepEqual(readJsonFile(f), { good: 3 });
  // .bak still holds valid data (never clobbered by CORRUPT)
  assert.deepEqual(readJsonFile(`${f}.bak`), { good: true });
  rmSync(dir, { recursive: true, force: true });
});

test('missing file returns fallback', () => {
  const dir = freshDir();
  const f = join(dir, 'nope.json');
  assert.equal(readJsonFile(f, 'FB'), 'FB');
  rmSync(dir, { recursive: true, force: true });
});

test('atomic write leaves no .tmp files behind', () => {
  const dir = freshDir();
  const f = join(dir, 'd.json');
  writeJsonFile(f, { a: 1 });
  writeJsonFile(f, { a: 2 });
  const leftovers = readdirSync(dir).filter((n) => n.includes('.tmp'));
  assert.deepEqual(leftovers, []);
  rmSync(dir, { recursive: true, force: true });
});
