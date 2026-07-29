/** ANTHROPIC_API_KEY 사전 검증 — 배포 전에 인증·크레딧·모델 접근을 한 번에 확인한다.
 *  로컬:  ANTHROPIC_API_KEY=sk-... node scripts/ai-keycheck.mjs
 *  서버:  docker exec itam-web node scripts/ai-keycheck.mjs   (컨테이너 env 사용) */
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'

const key = process.env.ANTHROPIC_API_KEY
if (!key) {
  console.error('FAIL — ANTHROPIC_API_KEY 미설정')
  process.exit(1)
}
const fp = createHash('sha256').update(key.trim()).digest('hex').slice(0, 12)
console.log(`key fingerprint: ${fp} (34a300b71f59 = 크레딧 없는 기존 edim 키)`)

const model = process.env.ANTHROPIC_MODEL_ID || 'claude-opus-5'
const client = new Anthropic({ apiKey: key })
try {
  const r = await client.messages.create({
    model,
    max_tokens: 64,
    messages: [{ role: 'user', content: 'OK라고만 답하세요.' }],
  })
  console.log(`OK — model=${r.model} stop=${r.stop_reason} out_tokens=${r.usage.output_tokens}`)
} catch (e) {
  console.error(`FAIL — ${e.status ?? ''} ${e.message}`)
  process.exit(1)
}
