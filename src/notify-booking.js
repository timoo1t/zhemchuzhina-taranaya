import { MaxClient } from './max-client.js';
import { VkClient } from './vk-client.js';

/**
 * @param {object} booking
 */
export function formatBookingMessage(booking) {
  const {
    houseNumber,
    checkIn,
    checkOut,
    guestName,
    guestPhone,
    guestEmail,
    amount,
    currency = '₽',
    paid = true,
    bookingId,
  } = booking;

  const lines = [
    '**Новая бронь!**',
    '',
    `Домик: **№${houseNumber}**`,
    `Заезд: ${formatDate(checkIn)}`,
    `Выезд: ${formatDate(checkOut)}`,
  ];

  if (guestName) lines.push(`Гость: ${guestName}`);
  if (guestPhone) lines.push(`Телефон: ${guestPhone}`);
  if (guestEmail) lines.push(`Email: ${guestEmail}`);
  if (amount != null) {
    lines.push(`Оплата: ${formatAmount(amount)} ${currency}${paid ? ' (оплачено)' : ' (ожидает оплаты)'}`);
  } else if (paid) {
    lines.push('Статус: оплачено');
  }

  if (bookingId) lines.push(`ID брони: \`${bookingId}\``);

  return lines.join('\n');
}

/** Текст без markdown — для VK и SMS */
export function formatBookingMessagePlain(booking) {
  return formatBookingMessage(booking)
    .replace(/\*\*/g, '')
    .replace(/`/g, '');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatAmount(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function resolveChannels(via) {
  const mode = (via ?? process.env.NOTIFY_VIA ?? 'auto').toLowerCase();
  if (mode === 'off' || mode === 'none') return [];
  if (mode === 'vk') return ['vk'];
  if (mode === 'max') return ['max'];
  if (mode === 'sms') return ['sms'];

  const channels = [];
  if (process.env.VK_ACCESS_TOKEN && process.env.VK_ADMIN_PEER_ID) channels.push('vk');
  if (process.env.MAX_BOT_TOKEN && process.env.MAX_ADMIN_USER_ID) channels.push('max');
  if (process.env.SMS_API_KEY && process.env.SMS_ADMIN_PHONE) channels.push('sms');
  return channels;
}

async function notifyViaVk(booking, options) {
  const token = options.token ?? process.env.VK_ACCESS_TOKEN;
  const peerId = Number(options.peerId ?? process.env.VK_ADMIN_PEER_ID);
  if (!token) throw new Error('VK_ACCESS_TOKEN не задан');
  if (!peerId) throw new Error('VK_ADMIN_PEER_ID не задан');

  const client = new VkClient({
    accessToken: token,
    apiVersion: process.env.VK_API_VERSION,
  });

  const messageId = await client.sendMessage({
    peerId,
    message: formatBookingMessagePlain(booking),
  });

  return { channel: 'vk', messageId };
}

async function notifyViaMax(booking, options) {
  const token = options.token ?? process.env.MAX_BOT_TOKEN;
  const adminUserId = Number(options.adminUserId ?? process.env.MAX_ADMIN_USER_ID);
  if (!token) throw new Error('MAX_BOT_TOKEN не задан');
  if (!adminUserId) throw new Error('MAX_ADMIN_USER_ID не задан');

  const client = new MaxClient({ token, apiBase: process.env.MAX_API_BASE_URL });
  const result = await client.sendMessage({
    userId: adminUserId,
    text: formatBookingMessage(booking),
    format: 'markdown',
  });

  return { channel: 'max', result };
}

async function notifyViaSms(booking) {
  const apiKey = process.env.SMS_API_KEY;
  const phone = process.env.SMS_ADMIN_PHONE;
  const provider = (process.env.SMS_PROVIDER || 'smsru').toLowerCase();

  if (!apiKey || !phone) {
    throw new Error('SMS_API_KEY и SMS_ADMIN_PHONE не заданы');
  }

  const text = formatBookingMessagePlain(booking).slice(0, 160);

  if (provider === 'smsru') {
    const url = new URL('https://sms.ru/sms/send');
    url.searchParams.set('api_id', apiKey);
    url.searchParams.set('to', phone.replace(/\D/g, ''));
    url.searchParams.set('msg', text);
    url.searchParams.set('json', '1');

    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK') {
      throw new Error(data.status_text || 'Ошибка SMS.ru');
    }
    return { channel: 'sms', result: data };
  }

  throw new Error(`SMS-провайдер "${provider}" не поддерживается`);
}

/**
 * Уведомление админу после оплаты.
 * NOTIFY_VIA: vk | max | sms | auto | off
 */
export async function notifyAdminAboutBooking(booking, options = {}) {
  const channels = resolveChannels(options.via);
  if (!channels.length) {
    return { skipped: true, reason: 'Каналы уведомлений не настроены (NOTIFY_VIA=off или пустой .env)' };
  }

  const results = [];
  const errors = [];

  for (const channel of channels) {
    try {
      if (channel === 'vk') results.push(await notifyViaVk(booking, options));
      if (channel === 'max') results.push(await notifyViaMax(booking, options));
      if (channel === 'sms') results.push(await notifyViaSms(booking));
    } catch (err) {
      errors.push({ channel, error: err.message });
    }
  }

  if (!results.length && errors.length) {
    throw new Error(errors.map((e) => `${e.channel}: ${e.error}`).join('; '));
  }

  return { sent: results, errors };
}
