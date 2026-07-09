const DEFAULT_API_VERSION = '5.199';

/**
 * Отправка личных сообщений от имени сообщества VK.
 * Документация: https://dev.vk.com/ru/method/messages.send
 */
export class VkClient {
  constructor({ accessToken, apiVersion = DEFAULT_API_VERSION }) {
    if (!accessToken) throw new Error('VK_ACCESS_TOKEN не задан');
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  async call(method, params = {}) {
    const url = new URL(`https://api.vk.com/method/${method}`);
    url.searchParams.set('access_token', this.accessToken);
    url.searchParams.set('v', this.apiVersion);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`VK API ${data.error.error_code}: ${data.error.error_msg}`);
    }
    return data.response;
  }

  sendMessage({ peerId, message }) {
    return this.call('messages.send', {
      peer_id: peerId,
      message,
      random_id: Date.now(),
    });
  }
}
