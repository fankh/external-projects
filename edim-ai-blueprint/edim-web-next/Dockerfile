# EDIM Next.js SSR — 멀티스테이지 (standalone 런타임)
# build:  docker compose build web-next
# run:    127.0.0.1:3000 (호스트 nginx 가 / → 3000 리버스 프록시)

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 빌드 시 백엔드 도메인 (런타임에도 env 로 재지정 가능)
ARG EDIM_API_BASE
ENV EDIM_API_BASE=${EDIM_API_BASE}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# standalone 산출물 + 정적 자원
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
