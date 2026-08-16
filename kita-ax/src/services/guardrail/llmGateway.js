/**
 * LLM Gateway - Outbound connector layer for LLM providers
 *
 * Supported providers:
 *   - anthropic : Anthropic Messages API (Claude)
 *   - openai    : OpenAI-compatible Chat Completions. Also covers any
 *                 OpenAI-compatible endpoint (Azure OpenAI, vLLM serving)
 *                 via OPENAI_BASE_URL override.
 *
 * Controls: destination host white-list, request timeout (AbortController),
 * single retry on transient failures (429/5xx/network).
 */

const config = {
  get provider() { return process.env.LLM_PROVIDER || 'anthropic'; },
  get timeoutMs() { return parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10); },
  get allowedHosts() {
    return (process.env.LLM_ALLOWED_HOSTS || 'api.anthropic.com,api.openai.com')
      .split(',').map((h) => h.trim()).filter(Boolean);
  },
  get anthropicKey() { return process.env.ANTHROPIC_API_KEY; },
  get anthropicModel() { return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'; },
  get openaiBaseUrl() { return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'; },
  get openaiKey() { return process.env.OPENAI_API_KEY; },
  get openaiModel() { return process.env.OPENAI_MODEL || 'gpt-4o-mini'; }
};

class GatewayError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.status = status;
  }
}

/** Reject destinations outside the configured white-list before any connection */
function assertHostAllowed(url) {
  const host = new URL(url).hostname;
  if (!config.allowedHosts.includes(host)) {
    throw new GatewayError(`LLM destination not white-listed: ${host}`, 'HOST_NOT_ALLOWED', 403);
  }
}

async function fetchWithRetry(url, init) {
  assertHostAllowed(url);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status === 429 || res.status >= 500) {
        lastError = new GatewayError(`Provider returned ${res.status}`, 'PROVIDER_ERROR', res.status);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err.name === 'AbortError'
        ? new GatewayError(`LLM request timed out after ${config.timeoutMs}ms`, 'TIMEOUT', 504)
        : new GatewayError(err.message, 'NETWORK_ERROR', 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const providers = {
  async anthropic({ messages, model, maxTokens }) {
    if (!config.anthropicKey) throw new GatewayError('ANTHROPIC_API_KEY is not configured', 'NOT_CONFIGURED', 500);
    const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || config.anthropicModel,
        max_tokens: maxTokens || 1024,
        messages
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new GatewayError(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`, 'PROVIDER_ERROR', res.status);
    }
    const data = await res.json();
    return {
      content: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
      model: data.model,
      usage: data.usage
    };
  },

  async openai({ messages, model, maxTokens }) {
    if (!config.openaiKey && !config.openaiBaseUrl.includes('localhost')) {
      throw new GatewayError('OPENAI_API_KEY is not configured', 'NOT_CONFIGURED', 500);
    }
    const res = await fetchWithRetry(`${config.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.openaiKey ? { authorization: `Bearer ${config.openaiKey}` } : {})
      },
      body: JSON.stringify({
        model: model || config.openaiModel,
        max_tokens: maxTokens || 1024,
        messages
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new GatewayError(`OpenAI-compatible API error ${res.status}: ${body.slice(0, 200)}`, 'PROVIDER_ERROR', res.status);
    }
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      usage: data.usage
    };
  }
};

class LlmGateway {
  /**
   * Send a chat completion request through the configured provider.
   *
   * @param {object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.provider] anthropic | openai (defaults to LLM_PROVIDER)
   * @param {string} [params.model]
   * @param {number} [params.maxTokens]
   * @returns {Promise<{content: string, model: string, usage: object, provider: string}>}
   */
  static async chat({ messages, provider, model, maxTokens }) {
    const name = provider || config.provider;
    const impl = providers[name];
    if (!impl) throw new GatewayError(`Unknown LLM provider: ${name}`, 'UNKNOWN_PROVIDER', 400);
    const result = await impl({ messages, model, maxTokens });
    return { ...result, provider: name };
  }

  static get GatewayError() {
    return GatewayError;
  }
}

module.exports = LlmGateway;
