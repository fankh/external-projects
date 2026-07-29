FROM node:22-alpine
WORKDIR /app

# 컨테이너 기본 시간대는 UTC 다. 앱은 코드에서 Asia/Seoul 을 명시하지만(lib/dates.ts),
# 로그·date 출력도 KST 로 맞춰 디버깅 시 혼동을 없앤다.
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && echo "Asia/Seoul" > /etc/timezone
ENV TZ=Asia/Seoul

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3390
CMD ["npm", "start", "--", "-p", "3390"]
