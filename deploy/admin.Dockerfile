# 新架构管理端镜像（Vue 3 + Vite 构建，Nginx 托管）
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json

RUN npm ci

COPY apps/admin ./apps/admin
RUN npm run build -w @saas/admin

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80
