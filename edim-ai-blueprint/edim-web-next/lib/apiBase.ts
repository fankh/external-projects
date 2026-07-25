/** FastAPI 베이스 주소 — 단일 출처.
 *
 * 종전엔 19개 파일이 각자 `process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'`
 * 를 들고 있었다. 환경변수를 빠뜨린 배포가 **조용히 개발 데모 서버로 붙는** 사고가 나므로
 * (고객 데이터가 남의 서버로 나가는 방향), 기본값을 같은 배포 안의 backend 직결로 바꾸고
 * 한 곳에서만 정의한다.
 *
 * 로컬 개발에서 원격 API 를 보려면 `.env.local` 에 EDIM_API_BASE 를 명시한다.
 */
const DEFAULT_BASE = 'http://backend:8000/api/v1'   // compose 내부 서비스명 — 자기 배포에 갇힘

export const API_BASE = (process.env.EDIM_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '')

/** 기본값으로 떨어졌는지 — 진단·로그용 (설정 누락을 조용히 넘기지 않기 위해). */
export const API_BASE_IS_DEFAULT = !process.env.EDIM_API_BASE
