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
CMD ["npm", "start", "--", "-p", "3390"]
