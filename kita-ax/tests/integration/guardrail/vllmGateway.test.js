/**
 * Integration Test - LLM gateway <-> local vLLM (OpenAI-compatible)
 *
 * Starts the mock vLLM server (real HTTP, no fetch mocking) and drives a real
 * round-trip through the gateway's `vllm` provider. Verifies the OpenAI-
 * compatible protocol wiring and the destination host white-list, which is
 * what the appliance relies on to talk to the internal GPU node.
 */

const { createMockVllmServer } = require('../../../scripts/mock-vllm-server');
const LlmGateway = require('../../../src/services/guardrail/llmGateway');

let server;
let port;

beforeAll(async () => {
  server = createMockVllmServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  process.env.VLLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.VLLM_MODEL = 'local-model';
  process.env.LLM_ALLOWED_HOSTS = '127.0.0.1';
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('LlmGateway vllm provider', () => {
  test('completes a real round-trip against an OpenAI-compatible endpoint', async () => {
    const res = await LlmGateway.chat({
      provider: 'vllm',
      messages: [{ role: 'user', content: '내부망 여신 요약' }]
    });

    expect(res.provider).toBe('vllm');
    expect(res.model).toBe('local-model');
    expect(res.content).toBe('[local-vllm] 내부망 여신 요약');
  });

  test('rejects a destination host that is not white-listed', async () => {
    process.env.VLLM_BASE_URL = 'http://evil.example:8000/v1';
    await expect(
      LlmGateway.chat({ provider: 'vllm', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });

    // restore for any later tests
    process.env.VLLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  });
});
