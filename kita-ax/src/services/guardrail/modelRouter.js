/**
 * Model Router - Chooses the LLM backend per request (dual-backend routing)
 *
 * Data-sovereignty policy: any request carrying a sensitive document
 * classification is forced to the internal vLLM model so its content never
 * leaves the internal network. Non-sensitive requests honor the caller's
 * model selection, falling back to the configured default backend.
 *
 * Config (env):
 *   LLM_PROVIDER                    default backend (anthropic | openai | vllm)
 *   LLM_LOCAL_PROVIDER              local backend name (default 'vllm')
 *   LLM_FORCE_LOCAL_CLASSIFICATIONS comma list forced to local
 *                                   (default 'confidential,secret,restricted')
 */

const SELECTABLE = new Set(['anthropic', 'openai', 'vllm']);

function config() {
  return {
    defaultProvider: process.env.LLM_PROVIDER || 'anthropic',
    localProvider: process.env.LLM_LOCAL_PROVIDER || 'vllm',
    forceLocal: (process.env.LLM_FORCE_LOCAL_CLASSIFICATIONS || 'confidential,secret,restricted')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  };
}

class ModelRouter {
  /**
   * Decide which backend a request should use.
   *
   * @param {object} params
   * @param {string} [params.classification] document classification of the request context
   * @param {string} [params.userProvider] backend the user explicitly selected
   * @param {string} [params.userModel] model the user explicitly selected
   * @returns {{ provider: string, model: string|undefined, reason: string, forcedLocal: boolean }}
   */
  static route({ classification, userProvider, userModel } = {}) {
    const cfg = config();
    const cls = (classification || '').toLowerCase();

    // 1) Sensitive classification -> force local, ignore any external selection
    if (cls && cfg.forceLocal.includes(cls)) {
      return {
        provider: cfg.localProvider,
        model: cfg.localProvider === userProvider ? userModel : undefined,
        reason: `policy:classification:${cls}`,
        forcedLocal: true
      };
    }

    // 2) Honor a valid user selection
    if (userProvider && SELECTABLE.has(userProvider)) {
      return { provider: userProvider, model: userModel, reason: 'user-selected', forcedLocal: false };
    }

    // 3) Fall back to the configured default backend
    return { provider: cfg.defaultProvider, model: undefined, reason: 'default', forcedLocal: false };
  }
}

module.exports = ModelRouter;
