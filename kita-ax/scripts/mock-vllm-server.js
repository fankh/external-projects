/**
 * Mock vLLM server - minimal OpenAI-compatible endpoint for local integration
 *
 * Serves POST /v1/chat/completions and GET /v1/models with the same response
 * shape vLLM produces, so the LLM gateway's `vllm` provider can be exercised
 * end-to-end without a GPU. Intended for development and integration tests
 * only; NOT a substitute for a real vLLM deployment.
 *
 * Usage:  node scripts/mock-vllm-server.js            (defaults to :8000)
 *         MOCK_VLLM_PORT=9001 node scripts/mock-vllm-server.js
 */

const http = require('http');

const MODEL = process.env.MOCK_VLLM_MODEL || 'local-model';

function createMockVllmServer() {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: MODEL, object: 'model' }] }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch (_e) { /* ignore */ }
        const userMsg = (parsed.messages || []).filter((m) => m.role === 'user').pop();
        const echo = userMsg ? userMsg.content : '';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          model: parsed.model || MODEL,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: `[local-vllm] ${echo}` },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        }));
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
}

module.exports = { createMockVllmServer, MODEL };

// Run standalone when invoked directly
if (require.main === module) {
  const port = parseInt(process.env.MOCK_VLLM_PORT || '8000', 10);
  createMockVllmServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Mock vLLM (OpenAI-compatible) listening on http://localhost:${port}/v1`);
  });
}
