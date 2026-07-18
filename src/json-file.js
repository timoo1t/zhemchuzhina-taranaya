import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname } from 'node:path';

/*
 * Safe JSON persistence for the flat-file data layer.
 *
 * writeJsonFile:
 *   1. keeps a `<file>.bak` copy of the last *valid* version before overwriting
 *      (защита от случайного удаления / затирания хорошими данными плохих);
 *   2. writes to a temp file then renames it over the target, so a crash mid-write
 *      never leaves a truncated / corrupt JSON on disk (защита от битой записи).
 *
 * readJsonFile:
 *   falls back to `<file>.bak` when the main file is missing or unparseable,
 *   so one bad write can't wipe out bookings/reviews/etc.
 */

let tmpCounter = 0;

function tryReadParse(file) {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export function readJsonFile(file, fallback) {
  const parsed = tryReadParse(file);
  if (parsed !== undefined) return parsed;

  const bak = `${file}.bak`;
  const fromBak = tryReadParse(bak);
  if (fromBak !== undefined) {
    console.warn(`[Storage] ${file} нечитаем — восстановлено из ${bak}`);
    return fromBak;
  }
  return fallback;
}

function backupIfValid(file) {
  if (!existsSync(file)) return;
  try {
    // only back up a file that currently parses — never let a corrupt file
    // clobber the last-known-good .bak.
    JSON.parse(readFileSync(file, 'utf8'));
    copyFileSync(file, `${file}.bak`);
  } catch (err) {
    console.warn(`[Storage] Пропущен бэкап ${file}:`, err.message);
  }
}

export function writeJsonFile(file, data) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const json = JSON.stringify(data, null, 2);
  backupIfValid(file);

  const tmp = `${file}.tmp-${process.pid}-${tmpCounter++}`;
  writeFileSync(tmp, json, 'utf8');
  renameSync(tmp, file); // atomic replace (MoveFileEx w/ REPLACE_EXISTING on Windows)
}
