FROM node:22-alpine
WORKDIR /app

# 컨테이너 기본 시간대는 UTC 다. 앱은 코드에서 KST 를 명시하지만(lib/dates.ts),
# 로그·date 출력도 KST 로 맞춰 디버깅 시 혼동을 없앤다.
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && echo "Asia/Seoul" > /etc/timezone
ENV TZ=Asia/Seoul

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production

# 파일 기반 영속화 — 스토어를 /data/portal-data.json 에 저장한다. 재시작·재생성 후에도
# 상태를 유지하려면 /data 를 도커 볼륨으로 마운트한다: docker run -v portal-data:/data ...
# 쓰기가 필요한 경로(/data, .next 캐시)만 node 소유로 바꾸고 비루트로 실행한다 (최소 권한)
RUN mkdir -p /data && chown -R node:node /data /app/.next
ENV PORTAL_DATA_FILE=/data/portal-data.json
# 일일 알림 배치 — 24시간 주기 자동 실행 (미서약·점검 경과·SR 지연·재택 미제출 안내메일)
ENV PORTAL_NOTIFY_INTERVAL_MS=86400000
VOLUME ["/data"]
USER node

EXPOSE 3400
# 오케스트레이터(도커·컴포즈)가 기동 실패·행업을 감지하도록 로그인 화면을 프로브한다
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3400/login >/dev/null 2>&1 || exit 1
CMD ["npm", "start", "--", "-p", "3400"]
