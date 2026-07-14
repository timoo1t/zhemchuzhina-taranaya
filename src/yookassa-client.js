import { randomUUID } from 'node:crypto';

const API_URL = 'https://api.yookassa.ru/v3/payments';

export class YooKassaClient {
  constructor({ shopId, secretKey }) {
    if (!shopId || !secretKey) {
      throw new Error('YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY не заданы');
    }
    this.auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  }

  async createPayment({ amount, description, returnUrl, metadata, receipt }) {
    const body = {
      amount: {
        value: Number(amount).toFixed(2),
        currency: 'RUB',
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: returnUrl,
      },
      description,
      metadata,
    };

    if (receipt) body.receipt = receipt;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': randomUUID(),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.description || data?.message || 'Ошибка ЮKassa');
    }
    return data;
  }

  async getPayment(paymentId) {
    const response = await fetch(`${API_URL}/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${this.auth}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.description || data?.message || 'Ошибка ЮKassa');
    }
    return data;
  }
}
