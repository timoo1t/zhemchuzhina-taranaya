/**
 * Утилита для получения вашего user_id в MAX.
 *
 * Как использовать:
 * 1. Создайте бота на https://dev.max.ru
 * 2. Скопируйте токен в .env (MAX_BOT_TOKEN=...)
 * 3. Откройте бота в приложении MAX и нажмите «Начать» / напишите любое сообщение
 * 4. Запустите: npm run get-user-id
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MaxClient } from '../src/max-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, '..', '.env'));

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function extractUserId(update) {
  if (update.user?.user_id) return update.user;
  if (update.message?.sender?.user_id) return update.message.sender;
  if (update.message?.author?.user_id) return update.message.author;
  return null;
}

async function main() {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) {
    console.error('Задайте MAX_BOT_TOKEN в файле .env');
    process.exit(1);
  }

  const client = new MaxClient({ token, apiBase: process.env.MAX_API_BASE_URL });

  console.log('Проверяю бота...');
  const me = await client.getMe();
  console.log(`Бот: @${me.username} (id: ${me.user_id})\n`);
  console.log('Ожидаю событие от вас в MAX (напишите боту «Привет»)...');
  console.log('Нажмите Ctrl+C для выхода.\n');

  let marker = null;

  for (;;) {
    const { updates = [], marker: nextMarker } = await client.getUpdates({
      marker,
      timeout: 30,
      types: 'bot_started,message_created',
    });

    marker = nextMarker ?? marker;

    for (const update of updates) {
      const user = extractUserId(update);
      if (!user) continue;

      console.log('---');
      console.log(`Событие: ${update.update_type}`);
      console.log(`Ваш user_id: ${user.user_id}`);
      if (user.name) console.log(`Имя: ${user.name}`);
      console.log('\nДобавьте в .env:');
      console.log(`MAX_ADMIN_USER_ID=${user.user_id}`);
      console.log('---\n');
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
