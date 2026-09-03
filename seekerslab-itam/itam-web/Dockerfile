FROM node:22-alpine
WORKDIR /app

# 컨테이너 기본 시간대는 UTC 다. 앱은 코드에서 Asia/Seoul 을 명시하지만(lib/dates.ts),
# 로그·date 출력도 KST 로 맞춰 디버깅 시 혼동을 없앤다.
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && echo "Asia/Seoul" > /etc/timezone
ENV TZ=Asia/Seoul

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
#  빌드 캐시는 이미지에 남기지 않는다 — .next/cache 는 다음 빌드를 빠르게 하려고 쌓는 것이라
#   실행에는 전혀 쓰이지 않는데, 실측 215MB 로 실행에 필요한 .next/server+static(7.1MB)의 30배였다.
#   .dockerignore 의 '.next' 는 빌드 컨텍스트에서만 제외한다 — 컨테이너 안에서 next build 가
#   .next 를 새로 만들므로 그 안의 cache 는 그대로 최종 이미지에 남는다(텍스트 검사로는 안 보인다).
RUN npm run build && rm -rf .next/cache

ENV NODE_ENV=production

# 파일 기반 영속화 — 스토어를 /data/store.json 에 저장한다. 재시작·재생성 후에도 상태를
# 유지하려면 /data 를 도커 볼륨으로 마운트한다: docker run -v itam-data:/data ...
# 볼륨을 마운트하지 않으면 컨테이너 쓰기 레이어에 저장돼 재생성 시 사라진다(= 종전 동작).
RUN mkdir -p /data
ENV ITAM_DATA_FILE=/data/store.json
VOLUME ["/data"]

EXPOSE 3390

#  헬스 체크 — README 의 배포 명령은 `--restart unless-stopped` 를 쓴다. 그런데 그 정책은 프로세스가
#   죽었을 때만 재시작하므로, 살아 있으면서 응답하지 않는 상태(이벤트 루프 정지·핸들 고갈)는 '정상'으로
#   남는다. 도커가 응답 여부로 판정할 수 있게 프로브를 준다.
#   /login 을 쓴다 — 미인증으로 200 을 내는 유일한 화면이라 세션 없이 확인할 수 있다.
#   node 로 부른다: 이미지에 curl·wget 이 없다(node:22-alpine 은 busybox wget 만 있고 그마저 옵션이 다르다).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3390/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "start", "--", "-p", "3390"]
