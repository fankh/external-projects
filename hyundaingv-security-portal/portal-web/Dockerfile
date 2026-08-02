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
RUN mkdir -p /data
ENV PORTAL_DATA_FILE=/data/portal-data.json
VOLUME ["/data"]

EXPOSE 3400
CMD ["npm", "start", "--", "-p", "3400"]
