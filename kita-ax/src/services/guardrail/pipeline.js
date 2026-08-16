/**
 * Guardrail Pipeline - Orchestrates the per-request security flow
 *
 *   prompt -> injection check (L1) -> DLP scan+mask (prompt)
 *          -> LLM gateway -> DLP scan+mask (response) -> audit record
 *
 * Each stage is timed separately so the PoC can report guardrail overhead
 * (inspection latency) independently of LLM latency.
 */

const InjectionDefense = require('./injectionDefense');
const DlpEngine = require('./dlpEngine');
const LlmGateway = require('./llmGateway');
const GuardrailAuditTrail = require('./auditTrail');
const ModelRouter = require('./modelRouter');

const BLOCKED_MESSAGE = '보안 정책에 따라 요청이 차단되었습니다. 프롬프트 인젝션 시도로 판단되는 표현이 포함되어 있습니다. 문의: 정보보호 담당자';

class GuardrailPipeline {
  /**
   * Process one chat request through the guardrail.
   *
   * @param {object} params
   * @param {string} params.content user prompt
   * @param {string} params.tenantId
   * @param {string} params.userEmail
   * @param {string[]} [params.allowCategories] DLP contextual whitelist for this user/dept
   * @param {string} [params.provider] user-selected LLM provider
   * @param {string} [params.model] user-selected model
   * @param {string} [params.classification] document classification of the request context
   * @param {string} [params.ipAddress]
   * @returns {Promise<{verdict: string, content: string, sentPrompt: string|null, meta: object}>}
   */
  static async process({ content, tenantId, userEmail, allowCategories, provider, model, classification, ipAddress }) {
    const timings = {};
    let t = process.hrtime.bigint();
    const lap = () => {
      const now = process.hrtime.bigint();
      const ms = Number(now - t) / 1e6;
      t = now;
      return Math.round(ms * 100) / 100;
    };

    // 1) Injection defense (L1)
    const injection = InjectionDefense.inspect(content);
    timings.injectionMs = lap();

    if (injection.blocked) {
      await GuardrailAuditTrail.record({
        tenantId, userEmail, verdict: 'blocked', stage: 'injection', prompt: content,
        detail: { riskScore: injection.riskScore, rules: injection.matches.map((m) => m.id), timings, ipAddress }
      });
      return {
        verdict: 'blocked',
        content: BLOCKED_MESSAGE,
        sentPrompt: null,
        meta: { stage: 'injection', riskScore: injection.riskScore, rules: injection.matches.map((m) => m.id), timings }
      };
    }

    // 2) DLP on prompt - mask before anything leaves the appliance
    const promptScan = DlpEngine.scan(content, { allowCategories });
    timings.dlpPromptMs = lap();
    const sentPrompt = promptScan.maskedText;

    // 3) Route to a backend (sensitive classifications are forced to local vLLM)
    const routing = ModelRouter.route({ classification, userProvider: provider, userModel: model });

    // 4) LLM call through the white-listed gateway
    let llm;
    try {
      llm = await LlmGateway.chat({
        messages: [{ role: 'user', content: sentPrompt }],
        provider: routing.provider,
        model: routing.model
      });
      timings.llmMs = lap();
    } catch (err) {
      timings.llmMs = lap();
      await GuardrailAuditTrail.record({
        tenantId, userEmail, verdict: 'blocked', stage: 'gateway', prompt: content,
        detail: { error: err.code || err.message, routing, timings, ipAddress }
      });
      throw err;
    }

    // 4) DLP on response - a model may echo sensitive data back
    const responseScan = DlpEngine.scan(llm.content, { allowCategories });
    timings.dlpResponseMs = lap();

    const masked = promptScan.findings.length > 0 || responseScan.findings.length > 0;
    const verdict = masked ? 'masked' : 'allowed';

    await GuardrailAuditTrail.record({
      tenantId, userEmail, verdict, stage: masked ? 'dlp_prompt' : 'clean',
      prompt: content, response: responseScan.maskedText,
      detail: {
        provider: llm.provider,
        model: llm.model,
        routing,
        riskScore: injection.riskScore,
        flaggedRules: injection.matches.map((m) => m.id),
        promptFindings: promptScan.findings,
        responseFindings: responseScan.findings,
        timings,
        ipAddress
      }
    });

    return {
      verdict,
      content: responseScan.maskedText,
      sentPrompt,
      meta: {
        provider: llm.provider,
        model: llm.model,
        routing,
        riskScore: injection.riskScore,
        promptFindings: promptScan.findings,
        responseFindings: responseScan.findings,
        guardrailOverheadMs: Math.round((timings.injectionMs + timings.dlpPromptMs + timings.dlpResponseMs) * 100) / 100,
        timings
      }
    };
  }
}

module.exports = GuardrailPipeline;
