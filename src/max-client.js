const DEFAULT_API_BASE = 'https://platform-api2.max.ru';

/**
 * Клиент MAX Bot API для отправки уведомлений.
 * Документация: https://dev.max.ru/docs-api
 */
export class MaxClient {
  /**
   * @param {object} options
   * @param {string} options.token — токен бота из кабинета MAX
   * @param {string} [options.apiBase] — базовый URL API
   */
  constructor({ token, apiBase = DEFAULT_API_BASE }) {
    if (!token) {
      throw new Error('MAX_BOT_TOKEN не задан');
    }
    this.token = token;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(`${this.apiBase}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message = data?.message || data?.error || text || response.statusText;
      throw new Error(`MAX API ${response.status}: ${message}`);
    }

    return data;
  }

  /** Проверка токена и информации о боте */
  getMe() {
    return this.request('GET', '/me');
  }

  /**
   * Отправить текстовое сообщение пользователю или в чат.
   * @param {object} params
   * @param {number} [params.userId] — ID получателя (личный чат)
   * @param {number} [params.chatId] — ID группового чата
   * @param {string} params.text — текст до 4000 символов
   * @param {'markdown'|'html'} [params.format]
   */
  sendMessage({ userId, chatId, text, format }) {
    if (!userId && !chatId) {
      throw new Error('Укажите userId или chatId');
    }

    const query = {};
    if (userId) query.user_id = userId;
    if (chatId) query.chat_id = chatId;

    const body = { text, notify: true };
    if (format) body.format = format;

    return this.request('POST', '/messages', { query, body });
  }

  /** Long polling — только для разработки и получения user_id */
  getUpdates({ marker, limit = 100, timeout = 30, types } = {}) {
    const query = { limit, timeout };
    if (marker !== undefined) query.marker = marker;
    if (types) query.types = types;
    return this.request('GET', '/updates', { query });
  }
}
