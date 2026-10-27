# 三磊·车邻汇客户订货系统

面向渠道客户的订货 SaaS 首期实现，包含原生微信小程序和 PC 管理端。系统按客户专属价与价格等级展示产品，支持滚动月度计划、邦邦转交三磊、预付款分批发货、真实/虚拟库存、缺货公平分配、售后与财务记录。

## 当前可运行内容

- 客户：手机号登录、专属产品目录、购物车、五类订单、月度采购计划、订单跟踪、测试/正式微信支付适配、物流与分批收货、售后申请。
- 邦邦：客户与车型区域授权、价格体系、计划一审、订单确认、应收查看。
- 三磊：计划终审、接单、真实/虚拟库存、库存移库、订单分批发货、缺货加权分配。
- 财务与售后：微信收款记录、发票、运费、调整款、索赔/退货/换货。
- 数据：客户、产品、价格、库存、订单、收款、计划均可导出 Excel，基础资料可通过 `.xlsx` 或 CSV 导入。
- 安全：客户数据隔离、角色权限、价格快照、支付回调验签预留、库存预占、操作审计。

## 本地启动

需要 Node.js 24 或更高版本（使用内置 SQLite 驱动）。

```powershell
node server/index.js
```

浏览器打开 `http://localhost:8787`。首次启动自动创建 `data/order-system.db` 并写入演示数据。

演示内部密码统一为 `Admin@123`：

| 用户名 | 角色 |
| --- | --- |
| `admin` | 系统管理员 |
| `bangbang` | 邦邦运营 |
| `sanlei` | 三磊内勤 |
| `warehouse` | 三磊仓库 |
| `finance` | 三磊财务 |
| `service` | 三磊售后 |

演示客户手机号：`13800000001`、`13800000002`、`13800000003`。

内部账号登录后可在右上角“改密”修改密码。全新数据库也可通过环境变量 `DEMO_ADMIN_PASSWORD` 指定首次启动密码。

## 微信小程序开发

1. 打开微信开发者工具，导入 [miniprogram](./miniprogram) 目录。
2. 当前 `project.config.json` 使用测试 AppID，`urlCheck` 已关闭。
3. 本机联调时 `miniprogram/config.js` 的 `develop` 地址默认为 `http://127.0.0.1:8787/api`。
4. 用演示客户手机号登录，即可完成选品、下单、计划、测试支付、查物流和售后。

项目不是独立 APK，而是微信小程序。资质到位并发布后，客户通过微信扫码进入，并可添加到“我的小程序”。

## 微信正式接入

复制 `.env.example` 为 `.env`，配置：

```dotenv
WECHAT_MODE=real
WECHAT_APP_ID=小程序AppID
WECHAT_APP_SECRET=小程序AppSecret
WECHAT_MCH_ID=邦邦微信支付商户号
WECHAT_API_V3_KEY=32位APIv3密钥
WECHAT_CERT_SERIAL=商户API证书序列号
WECHAT_PRIVATE_KEY_PATH=/run/secrets/apiclient_key.pem
WECHAT_PLATFORM_CERT_PATH=/run/secrets/wechatpay_platform.pem
WECHAT_NOTIFY_URL=https://你的域名/api/wechat/pay/notify
```

同时把 [miniprogram/config.js](./miniprogram/config.js) 中的 `trial` 和 `release` 地址改为已备案的 HTTPS 地址，在微信公众平台配置 request 合法域名、支付授权目录和订阅消息模板。没有上述资质时系统继续使用完整测试模式，但不会产生真实扣款。

详细部署说明见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)，需求覆盖情况见 [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md)，接口约定见 [docs/API.md](./docs/API.md)。

## 测试与检查

```powershell
node --test
node --check server/index.js
```

自动化测试覆盖价格优先级、客户隔离、预付款支付与分批发货、计划审核、缺货分配、财务记录、车型授权和 XLSX 导入导出。

## 数据与备份

默认数据库为 `data/order-system.db`。SQLite 已启用 WAL，备份时需要同时保留 `order-system.db`、`order-system.db-wal` 和 `order-system.db-shm`，或执行 SQLite 在线备份。正式部署建议每日备份并保留 30 天。

## 工程化架构（已迁移，待切换上线）

目标架构：**Fastify 5 + MySQL 8 + Drizzle ORM + Vue 3**。旧版 `server/`、`admin/`、`miniprogram/` 保留为回滚路径，新旧并存。

```
apps/api        # Fastify API（新）
apps/admin      # Vue 3 + Vite + Element Plus 管理端（新）
packages/db     # Drizzle schema + MySQL SQL 迁移 + 执行器
server/ admin/  # 旧版（SQLite，保留到迁移完成）
```

### 本地启动

```powershell
npm install

# 1. 在项目根 .env 配置 MySQL（Navicat 的 wms 连接下新建的 saas 库）
# DATABASE_URL=mysql://root:密码@127.0.0.1:3306/saas

# 2. 建表（26 张）
npm run db:migrate

# 3. 一次性导入旧 SQLite 演示数据（--dry-run 可先检查）
npm run db:import

# 4. 启动新 API（默认 8788）
npm run api:dev

# 5. 启动新管理端（默认 5173，代理 /api 到 8788）
npm run dev -w @saas/admin
```

### 测试与验收

```powershell
# 新架构：核心 + MySQL 集成测试（54 项）
npm test -w @saas/api

# 新架构：77 项验收（自动创建/销毁隔离库 saas_verify，不污染演示库）
node verify-api-http.mjs

# 旧版：12 项单元测试（SQLite 内存库，回归用）
node test/api.test.js

# 管理端打包验证（Rollup + compiler-sfc，不依赖浏览器/esbuild）
node verify-admin-build.mjs
```

`verify-api-http.mjs` 会创建 `saas_verify` 库、导入 `data/order-system.db` 演示数据、启动 Fastify、逐项校验 77 个契约点，结束后删除临时库。静态资源检查已按前后端分离调整为“管理端入口存在 + API 健康检查”。

### 容器化部署

```bash
# .env 中配置 DATABASE_URL 与微信参数；DOMAIN 用于 Caddy 证书
DOMAIN=order.example.com docker compose up -d --build
```

三个容器：`api`（Fastify，8788）、`admin`（Vue 构建产物 + Nginx）、`caddy`（HTTPS + `/api` 反代）。详见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。

### 当前进度

- 已完成：MySQL 26 表结构、SQLite 数据迁移与校验、全部后端接口（含导入导出、微信回调）、Vue 管理端 15/15 页、Docker/Caddy 新架构编排。
- 验收：新 API **77/77**、新测试 **54/54**、旧单元测试 **12/12**。
- 待完成：在真实环境构建管理端并做浏览器验收、切换 DNS/反代、旧版下线。


