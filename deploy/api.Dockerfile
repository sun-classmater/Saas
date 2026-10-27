# 新架构 API 镜像（Fastify + MySQL）
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/db/package.json packages/db/package.json

RUN npm ci --omit=dev --ignore-scripts

COPY apps/api ./apps/api
COPY packages/db ./packages/db

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV API_PORT=8788

EXPOSE 8788

CMD ["node", "apps/api/src/server.js"]
