# 新架构管理端镜像（Vue 3 + Vite 构建，Nginx 托管）
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/db/package.json packages/db/package.json

RUN npm ci

COPY apps/frontend ./apps/frontend
RUN npm run build -w @saas/frontend

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80
