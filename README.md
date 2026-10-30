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
apps/backend    # Fastify API（新）
apps/frontend   # Vue 3 + Vite + Element Plus 管理端（新）
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
npm run dev -w @saas/frontend
```

### 测试与验收

```powershell
# 新架构：核心 + MySQL 集成测试（54 项）
npm test -w @saas/backend

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

### Spring Boot 后端（已迁完，Node 版保留为回滚）

目标架构切换为 **前端 Vue + 后端 Java Spring Boot**，新后端在 [apps/backend-java](apps/backend-java)（Node 版 `apps/backend` 保留为回滚路径，两者**同端口，只能起一个**）。

| 项 | 选型 |
| --- | --- |
| 运行时 | Java 21（JDK 需 21+） |
| 框架 | Spring Boot 3.3.7（Web + Validation） |
| 持久层 | MyBatis 3.0.4（SQL 与 Node 版一一对应） |
| 数据库 | MySQL 8，沿用 `saas` 库与 26 张表（**无需迁移数据**） |
| 密码 | 与 Node 完全兼容：scrypt(N=16384,r=8,p=1,dkLen=64)，`saltHex:hashHex` |
| 构建 | Maven（IDEA 自带 3.9.9）；依赖仓 `/.m2repo`，产物 `/.build/backend-java` |

```powershell
npm run java:build     # 编译打包 → .build/backend-java/order-backend-0.1.0.jar
npm run java:run       # 运行（默认 8788，可 API_PORT=8789 换端口）
npm run java:where     # 查看自动定位到的 JDK / Maven
```

已完成端点：
`/api/health`、`/api/health/db`、`/api/auth/login`、`/api/auth/dev-login`、`/api/auth/logout`、`/api/auth/change-password`、`/api/me`；
`GET/POST /api/admin/customers`、`PUT /api/admin/customers/{id}`、`GET /api/admin/customers/{id}/authorizations`、`PUT /api/admin/customers/{id}/authorizations`、`GET /api/admin/customers/{id}/effective-prices`；
`GET/POST /api/admin/products`、`PUT /api/admin/products/{id}`、`GET/PUT /api/admin/prices`、`GET/POST /api/admin/suppliers`、`PUT /api/admin/suppliers/{id}`；
`GET /api/admin/orders`、`GET /api/admin/orders/{id}`（含明细、付款、发批次、同组子单）、`GET /api/admin/payments`；
`POST /api/admin/orders/{id}/actions` 已支持 `BANGBANG_CONFIRM`、`SANLEI_ACCEPT`、`SHIP`（分批发货、批次上限、预付款可用额度校验）、`CANCEL`；
`POST /api/admin/payments/mock` 模拟到账（创建支付单 + 到账回写订单已付/状态）；
客户侧（小程序）：`GET /api/mobile/profile`、`GET /api/mobile/catalog`（车型授权 + 生效价格）、`GET/POST /api/mobile/orders`（下单：价格快照/最小包装/计划周校验/按车型分单）、`GET /api/mobile/orders/{id}`、`POST /api/mobile/orders/{id}/cancel`、`POST /api/mobile/payments`、`POST /api/mobile/payments/{id}/mock-complete`、`POST /api/mobile/shipments/{id}/receive`；
采购计划：`GET /api/admin/plans`、`POST /api/admin/plans/{id}/actions`（两级审核）、`GET/POST /api/mobile/plans`、`PUT /api/mobile/plans/{id}`、`POST /api/mobile/plans/{id}/actions`（提交/撤回）；
库存：`GET /api/admin/inventory`、`GET /api/admin/inventory/movements`、`POST /api/admin/inventory/transfer`（移库）、`POST /api/admin/inventory/{id}/adjust`（手工调整）；
缺货分配：`GET /api/admin/shortages`、`GET /api/admin/shortages/{id}/preview`（预付款优先 + 六维加权，按最小包装取整后按余量二次分配）、`POST /api/admin/shortages/{id}/apply`；
财务：`GET /api/admin/finance`、`POST /api/admin/finance/invoices`、`POST /invoices/{id}/status`、`POST /finance/freight`、`POST /finance/adjustments`、`POST /finance/{kind}/{id}/settle`；
售后：`GET /api/admin/after-sales`、`PUT /api/admin/after-sales/{id}`、`GET/POST /api/mobile/after-sales`；
站内通知：`GET /api/notifications`、`POST /api/notifications/{id}/read`；
账号与审计：`GET /api/admin/users`、`POST /api/admin/users/customer`、`POST /users/staff`、`POST /users/{id}/toggle`、`GET /api/admin/audit-logs`（仅 `SUPER_ADMIN`）；
导出与模板：`GET /api/admin/exports/{orders|inventory|payments|plans}`（CSV）、`/exports/{kind}/xlsx`、`GET /api/admin/import-templates/{customers|products|prices|inventory}`（CSV/XLSX）——XLSX 用 Apache POI 生成；
导入：`POST /api/admin/imports/{kind}`（CSV）、`POST /api/admin/imports/{kind}/xlsx`（base64），5000 行上限、整批事务回滚、行号级错误；
微信回调：`POST /api/wechat/pay/notify`（mock 模式与 Node 一致返回 503；**正式模式验签尚未迁移**，会返回 501 明确报错）。

**双后端对照验证**：`node scripts/java-parity.mjs <javaBase> <nodeBase>` 会在同一份数据下逐端点比对 Java 与 Node 的 JSON（数值按 1e-6 容差），并在 Java 端跑创建/修改冒烟后自动清理测试数据。当前结果：客户/产品/供应商/价格/收款/订单列表/订单详情 8 类只读端点完全一致，7 项写入冒烟与权限边界全部通过。

**订单动作差分测试**：`node scripts/java-actions-test.mjs` 会建一个 `saas_java_verify` 独立库、导入演示数据、同时起 Java(8790) 与 Node(8791)，用 Node 下两两相同的订单，把同样的 confirm / accept / cancel / ship / mock-pay 分别打两个后端，逐字段比对结果后删库杀进程——既不污染演示数据，也能覆盖状态机、库存预占与到账回写。

**迁移状态：75/75 端点已覆盖，契约验收 77/77 通过。**

```powershell
# 用 Java 后端跑 Node 那套 77 项契约验收（独立库，自动建/删）
node scripts/verify-java-contract.mjs

# 端点清单对照（Node 路由 vs Java 映射）
node scripts/endpoint-inventory.mjs

# 双后端逐端点 JSON 对照（需先自行起 Java:8788 与 Node:8789）
node scripts/java-parity.mjs http://127.0.0.1:8788 http://127.0.0.1:8789

# 订单/财务等写入链路差分测试（自建库、自己起两端、跑完删库）
node scripts/java-actions-test.mjs
```

已知差异（有意保留）：
- 微信支付回调**正式模式**的验签尚未迁移，配置了证书时返回 `501 WECHAT_NOTIFY_NOT_READY`（mock 模式与 Node 一致返回 503）；需要真实商户证书才能补。
- 目录穿越路径 Node 返回 404、Spring Boot 的 Tomcat 在应用层之前返回 400，两者都不返回文件，契约脚本同时接受 400/403/404。

### 当前进度

- 已完成：MySQL 26 表结构、SQLite 数据迁移与校验、全部后端接口（含导入导出、微信回调、站内消息、审计日志）、Vue 管理端 16/16 页（含审计日志页、右上角改密与消息中心）、Docker/Caddy 新架构编排。
- 验收：新 API **77/77**、新测试 **54/54**、旧单元测试 **12/12**。
- 待完成：在真实环境构建管理端并做浏览器验收、切换 DNS/反代、旧版下线。


