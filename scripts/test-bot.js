/**
 * Тестовая отправка сообщения администратору.
 * Запуск: npm run test-bot
 */

import '../src/load-env.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notifyAdminAboutBooking } from '../src/notify-booking.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const result = await notifyAdminAboutBooking({
  houseNumber: 1,
  checkIn: '2026-07-10',
  checkOut: '2026-07-12',
  guestName: 'Иван Петров',
  guestPhone: '+7 999 111-22-33',
  amount: 8500,
  paid: true,
  bookingId: 'TEST-001',
});

if (result.skipped) {
  console.log('Уведомления отключены:', result.reason);
} else {
  console.log('Отправлено:', result.sent?.map((r) => r.channel).join(', ') || 'OK');
  if (result.errors?.length) console.warn('Ошибки:', result.errors);
}
