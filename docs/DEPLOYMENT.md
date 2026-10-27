# 部署与上线检查

## 新架构（Fastify + MySQL + Vue 3）

目标环境：已备案域名的 Linux 云服务器 + 可访问的 MySQL 8 实例（Navicat 的 wms 连接下 `saas` 库）。整站由三个容器组成：`api`（Fastify）、`admin`（Vue 构建产物 + Nginx）、`caddy`（HTTPS 入口与反代）。

```bash
cp .env.example .env
# 填写 DATABASE_URL（mysql://用户:密码@MySQL主机:3306/saas）与微信配置
DOMAIN=order.example.com docker compose up -d --build
```

路由关系：

```
https://域名/          → admin:80（Vue 静态资源，SPA fallback）
https://域名/api/*     → api:8788（Fastify / Drizzle）
```

数据库准备（首次）：

```bash
# 本机执行，需能连接目标 MySQL
npm run db:migrate      # 建 26 张表（schema_migrations 记录）
npm run db:import       # 可选：导入 data/order-system.db 演示数据
```

备份：使用 `mysqldump --single-transaction saas > saas-$(date +%F).sql`，建议每日执行并保留 30 天；同时备份 `.env` 与微信证书（不进入仓库）。

健康检查：`GET /api/health`（进程存活）、`GET /api/health/db`（数据库连通）。compose 已内置 api healthcheck。

> 若 MySQL 运行在宿主机而非独立服务器：Linux 使用 `--network host` 或宿主机内网 IP；Docker Desktop 使用 `host.docker.internal` 作为主机名。容器内不要用 `127.0.0.1` 指向宿主机 MySQL。

## 微信发布顺序

1. 使用邦邦主体的小程序 AppID 和微信支付商户号，配置商户 API 证书、平台证书及 API v3 密钥。
2. 将小程序 API 地址替换为正式 HTTPS 域名，配置 request 合法域名。
3. 编译并上传体验版，验证微信登录、手机号绑定、JSAPI 支付回调、退款和订单查询。
4. 完成商户真实性、经营类目与微信小程序审核后提交发布。
5. 发布后使用正式客户账号做一笔小额真实支付和一笔退款验收。

## 环境安全

- `WECHAT_MODE=mock` 会开放演示手机号登录，正式环境必须改为 `real`。
- 生产环境设置严格的 `CORS_ORIGIN`，不要使用默认 `*`。
- 私钥、平台证书和 API v3 密钥不进入代码仓库。
- 管理账号首次登录后必须修改演示密码。
- 每日备份数据库，并定期验证恢复。

## 验收与回滚

上线前按项目根执行：

```bash
node verify-api-http.mjs          # 77 项契约验收（隔离库 saas_verify，自动清理）
npm test -w @saas/api             # 54 项新测试
node test/api.test.js             # 12 项旧版单测
```

旧版 SQLite 服务（`server/` + `admin/` + 根目录 `Dockerfile`）保留为回滚路径，端口 8787。确认新架构稳定后再下线旧容器与代码。

## ERP 数据

当前版本按独立系统运行，通过 Excel 导入客户、产品、价格和期初库存，通过 Excel 导出订单、库存、收款和计划。后续若 ERP 开放 API，可在现有服务层增加同步适配器，不需要改变客户和小程序接口。
