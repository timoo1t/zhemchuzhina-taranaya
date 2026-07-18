import {
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const BACKUP_FILES = ['houses.json', 'bookings.json', 'blocked-dates.json', 'reviews.json', 'settings.json'];
const DAY_MS = 24 * 60 * 60 * 1000;

function todayFolderName() {
  return new Date().toISOString().slice(0, 10);
}

function runBackup({ dataDir, backupDir }) {
  if (!existsSync(dataDir)) return { ok: false, reason: 'no-data-dir' };
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const dayDir = resolve(backupDir, todayFolderName());
  if (!existsSync(dayDir)) mkdirSync(dayDir, { recursive: true });

  let copied = 0;
  for (const name of BACKUP_FILES) {
    const src = resolve(dataDir, name);
    if (!existsSync(src)) continue;
    const dst = resolve(dayDir, name);
    try {
      copyFileSync(src, dst);
      copied++;
    } catch (err) {
      console.warn(`[Backup] Не удалось скопировать ${name}:`, err.message);
    }
  }
  return { ok: true, copied, dayDir };
}

function pruneOldBackups({ backupDir, keepDays }) {
  if (!existsSync(backupDir)) return 0;
  const cutoff = Date.now() - keepDays * DAY_MS;
  let removed = 0;
  for (const entry of readdirSync(backupDir)) {
    const full = resolve(backupDir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (!s.isDirectory()) continue;
    if (s.mtimeMs < cutoff) {
      try {
        rmSync(full, { recursive: true, force: true });
        removed++;
      } catch (err) {
        console.warn(`[Backup] Не удалось удалить ${entry}:`, err.message);
      }
    }
  }
  return removed;
}

export function startBackupScheduler({ dataDir = resolve('data'), backupDir = resolve('data', 'backups'), keepDays = 30, intervalMs = DAY_MS } = {}) {
  const tick = () => {
    const res = runBackup({ dataDir, backupDir });
    if (res.ok) console.log(`[Backup] ${res.copied} файлов → ${res.dayDir}`);
    const removed = pruneOldBackups({ backupDir, keepDays });
    if (removed > 0) console.log(`[Backup] Удалено старых снимков: ${removed}`);
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
