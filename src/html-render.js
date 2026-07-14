import { readFileSync } from 'node:fs';

const cache = new Map();

function loadTemplate(filePath) {
  if (process.env.NODE_ENV === 'production') {
    if (!cache.has(filePath)) cache.set(filePath, readFileSync(filePath, 'utf8'));
    return cache.get(filePath);
  }
  return readFileSync(filePath, 'utf8');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderHtml(res, filePath, vars = {}) {
  let html = loadTemplate(filePath);
  for (const [key, value] of Object.entries(vars)) {
    const safe = key.endsWith('_RAW') ? String(value ?? '') : escapeHtml(value ?? '');
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(placeholder, safe);
  }
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
