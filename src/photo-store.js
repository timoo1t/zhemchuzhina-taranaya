import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const UPLOADS_DIR = resolve('public', 'images', 'uploads');
const PUBLIC_PREFIX = '/images/uploads/';
const MAX_BYTES = 15 * 1024 * 1024;

function ensureDir() {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
}

function parseDataUrl(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const rawExt = m[1].toLowerCase();
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > MAX_BYTES) return { tooLarge: true };
  return { ext, buffer };
}

export function savePhoto(houseNum, dataUrl, index = 0) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('Неподдерживаемый формат (только JPEG, PNG, WebP)');
  if (parsed.tooLarge) throw new Error('Файл больше 15 МБ');
  ensureDir();
  const rand = Math.floor(Math.random() * 10000);
  const name = `${houseNum}-${Date.now()}-${index}-${rand}.${parsed.ext}`;
  writeFileSync(resolve(UPLOADS_DIR, name), parsed.buffer);
  return PUBLIC_PREFIX + name;
}

export function deletePhotoFile(url) {
  if (typeof url !== 'string' || !url.startsWith(PUBLIC_PREFIX)) return;
  const name = url.slice(PUBLIC_PREFIX.length);
  if (name.includes('/') || name.includes('..')) return;
  try { unlinkSync(resolve(UPLOADS_DIR, name)); } catch {}
}
