/** 분류 정확도 — 판정 결과 환류(재학습) 반영. 제품안내서 §05 그림4 "판정 결과 환류 — 재학습·정확도 개선".
 *  그동안 classifyAccuracy 는 시드 고정값이었다(측정 기준값). feedbackLearning 이 켜지면 사람의 승인/반려
 *  판정을 근거로 정확도를 갱신한다 — 판정이 쌓일수록 관측 채택률로 이동하고, 적으면 기준값에 가깝게 둔다
 *  (축약추정 shrinkage — 소수 판정에 과민반응하지 않게). 화면·리포트·헤드라인이 같은 산출을 공유한다. */
import type { AiInsight, AiPolicy } from './types'

/** 환류에 반영되는 판정(승인·반려)만 집계 — 미판정(제안)은 분모에서 제외한다. */
export function feedbackJudged(insights: AiInsight[]): { judged: number; approved: number } {
  const j = insights.filter((i) => i.status === '승인' || i.status === '반려')
  return { judged: j.length, approved: j.filter((i) => i.status === '승인').length }
}

/** 피드백 반영 분류 정확도(%). feedbackLearning OFF 또는 판정 이력이 없으면 기준값 그대로. */
export function effectiveClassifyAccuracy(policy: AiPolicy, insights: AiInsight[]): number {
  const base = policy.classifyAccuracy
  if (!policy.feedbackLearning) return base
  const { judged, approved } = feedbackJudged(insights)
  if (judged === 0) return base
  const observed = (approved / judged) * 100
  const K = 8 // 사전확신(기준값) 가중 — 판정 K건 시점에서 기준값과 관측이 반반 섞인다
  const w = judged / (judged + K)
  return Math.round((base * (1 - w) + observed * w) * 10) / 10
}
