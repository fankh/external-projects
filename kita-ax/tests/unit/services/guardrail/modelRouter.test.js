/**
 * Unit Tests for Model Router (dual-backend routing policy)
 */

const ModelRouter = require('../../../../src/services/guardrail/modelRouter');

describe('ModelRouter.route', () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  it('forces sensitive classifications to the local backend', () => {
    process.env.LLM_LOCAL_PROVIDER = 'vllm';
    const r = ModelRouter.route({ classification: 'confidential', userProvider: 'anthropic' });
    expect(r.provider).toBe('vllm');
    expect(r.forcedLocal).toBe(true);
    expect(r.reason).toContain('policy:classification');
  });

  it('forces "restricted" and "secret" to local as well', () => {
    expect(ModelRouter.route({ classification: 'restricted' }).forcedLocal).toBe(true);
    expect(ModelRouter.route({ classification: 'secret' }).forcedLocal).toBe(true);
  });

  it('honors a valid user selection for non-sensitive requests', () => {
    const r = ModelRouter.route({ classification: 'internal', userProvider: 'anthropic', userModel: 'claude-sonnet-5' });
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBe('claude-sonnet-5');
    expect(r.reason).toBe('user-selected');
    expect(r.forcedLocal).toBe(false);
  });

  it('ignores an invalid user provider and uses the default', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    const r = ModelRouter.route({ userProvider: 'evil-provider' });
    expect(r.provider).toBe('anthropic');
    expect(r.reason).toBe('default');
  });

  it('falls back to the configured default backend with no inputs', () => {
    process.env.LLM_PROVIDER = 'openai';
    const r = ModelRouter.route({});
    expect(r.provider).toBe('openai');
    expect(r.reason).toBe('default');
  });

  it('respects a custom force-local classification list', () => {
    process.env.LLM_FORCE_LOCAL_CLASSIFICATIONS = 'internal,confidential';
    process.env.LLM_LOCAL_PROVIDER = 'vllm';
    expect(ModelRouter.route({ classification: 'internal', userProvider: 'anthropic' }).forcedLocal).toBe(true);
    expect(ModelRouter.route({ classification: 'public', userProvider: 'anthropic' }).forcedLocal).toBe(false);
  });
});
