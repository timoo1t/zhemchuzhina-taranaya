import { resolve } from 'node:path';
import { sanitizeSingleLine, sanitizeUrl } from './sanitize.js';
import { readJsonFile, writeJsonFile } from './json-file.js';

const FILE = resolve('data', 'settings.json');
const ALLOWED = ['sitePhone', 'sitePhoneSecondary', 'siteEmail', 'maxChannelUrl'];

function cleanValue(key, value) {
  if (key === 'maxChannelUrl') return sanitizeUrl(value);
  if (key === 'siteEmail') return sanitizeSingleLine(value, { maxLen: 200 });
  return sanitizeSingleLine(value, { maxLen: 60 });
}

export function getSettings() {
  return readJsonFile(FILE, {});
}

export function updateSettings(patch) {
  const current = getSettings();
  for (const key of ALLOWED) {
    if (key in patch) current[key] = cleanValue(key, patch[key]);
  }
  writeJsonFile(FILE, current);
  return current;
}
