import { sendEmail } from './send-email.js';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatAmount(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function buildBookingReceiptEmail(booking) {
  const siteName = process.env.SITE_NAME || 'Жемчужина-Тараная';
  const sitePhone = process.env.SITE_PHONE || '';
  const siteEmail = process.env.SITE_EMAIL || '';

  const subject = `Подтверждение брони — ${siteName}`;

  const lines = [
    `Здравствуйте, ${booking.guestName || 'гость'}!`,
    '',
    `Ваша бронь в «${siteName}» оплачена.`,
    '',
    `Номер брони: ${booking.id}`,
    `Домик: №${booking.houseNumber}`,
    `Заезд: ${formatDate(booking.checkIn)}`,
    `Выезд: ${formatDate(booking.checkOut)}`,
    `Гостей: ${booking.guests || 2}`,
    `Сумма: ${formatAmount(booking.amount)} ₽`,
    booking.paymentId ? `Платёж: ${booking.paymentId}` : '',
    '',
    'Адрес: Сахалинская обл., село Таранай',
    sitePhone ? `Телефон: ${sitePhone}` : '',
    siteEmail ? `Email: ${siteEmail}` : '',
    '',
    'До встречи!',
  ].filter(Boolean);

  const text = lines.join('\n');
  const html = `
    <div style="font-family:sans-serif;max-width:520px;line-height:1.5">
      <h2 style="margin:0 0 16px">Бронь оплачена</h2>
      <p>Здравствуйте, <strong>${booking.guestName || 'гость'}</strong>!</p>
      <p>Ваша бронь в «${siteName}» подтверждена.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:6px 0;color:#666">Номер брони</td><td><strong>${booking.id}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666">Домик</td><td>№${booking.houseNumber}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Заезд</td><td>${formatDate(booking.checkIn)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Выезд</td><td>${formatDate(booking.checkOut)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Сумма</td><td><strong>${formatAmount(booking.amount)} ₽</strong></td></tr>
      </table>
      <p style="color:#666;font-size:14px">Сахалинская обл., село Таранай<br>
      ${sitePhone ? `${sitePhone}<br>` : ''}${siteEmail || ''}</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendBookingReceiptEmail(booking) {
  const email = booking.guestEmail?.trim();
  if (!email) {
    return { skipped: true, reason: 'Email гостя не указан' };
  }

  const { subject, text, html } = buildBookingReceiptEmail(booking);
  return sendEmail({ to: email, subject, text, html });
}
