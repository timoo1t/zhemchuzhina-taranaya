import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve('data', 'settings.json');
const ALLOWED = ['sitePhone', 'sitePhoneSecondary', 'siteEmail', 'maxChannelUrl'];

export function getSettings() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function updateSettings(patch) {
  const current = getSettings();
  for (const key of ALLOWED) {
    if (key in patch) current[key] = String(patch[key] || '').trim();
  }
  const dir = resolve('data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FILE, JSON.stringify(current, null, 2), 'utf8');
  return current;
}
