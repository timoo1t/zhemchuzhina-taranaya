/**
 * Запуск сайта + публичный Pinggy-туннель для доступа с телефона.
 *
 * Использование: npm run mobile
 */

import '../src/load-env.js';
import { pinggy } from '@pinggy/pinggy';
import { startServer } from '../server.js';

const PORT = Number(process.env.PORT) || 3000;
const host = '127.0.0.1';

function pickHttpsUrl(urls) {
  const list = Array.isArray(urls) ? urls : [];
  return list.find((u) => String(u).startsWith('https://')) || list[0] || null;
}

async function main() {
  await startServer();

  console.log('\n[Pinggy] Поднимаю туннель...\n');

  const options = {
    forwarding: `${host}:${PORT}`,
  };

  if (process.env.PINGGY_TOKEN) {
    options.token = process.env.PINGGY_TOKEN;
  }

  const tunnel = await pinggy.forward(options);
  const urls = await tunnel.urls();
  const publicUrl = pickHttpsUrl(urls);

  if (publicUrl) {
    process.env.PINGGY_PUBLIC_URL = publicUrl.replace(/\/$/, '');
    console.log('══════════════════════════════════════════');
    console.log('  С телефона открой в браузере:');
    console.log(`  ${publicUrl}`);
    console.log('══════════════════════════════════════════');
    console.log('\nЛокально: http://localhost:' + PORT);
    console.log('Туннель бесплатный ~60 мин, потом перезапусти npm run mobile\n');
  } else {
    console.log('[Pinggy] Туннель запущен, URL:', urls);
  }

  const shutdown = async () => {
    console.log('\nОстанавливаю туннель...');
    pinggy.closeAllTunnels();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Pinggy] Ошибка:', err.message);
  console.error('\nЗапасной вариант (в отдельном терминале, пока работает npm start):');
  console.error(`  ssh -p 443 -R0:127.0.0.1:${PORT} -o StrictHostKeyChecking=no qr@free.pinggy.io`);
  process.exit(1);
});
