# API 与数据约定

服务接口统一使用 `/api` 前缀和 Bearer Token。成功响应为 `{ "data": ... }`，失败响应为 `{ "error": { "code", "message", "details" } }`。金额为人民币元，保留两位小数；数量为最小包装倍数；时间采用 ISO 8601，业务日期按 `Asia/Shanghai`。

## 身份与小程序

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 内部账号登录 |
| POST | `/api/auth/dev-login` | 仅测试模式的客户手机号登录 |
| POST | `/api/auth/wechat-login` | 正式微信 code + 手机号授权 code 登录 |
| POST | `/api/auth/logout` | 注销当前会话 |
| POST | `/api/auth/change-password` | 内部账号改密 |
| GET | `/api/mobile/catalog` | 当前客户已授权车型、已定价产品与库存 |
| GET | `/api/mobile/profile` | 客户授信、结算与联系方式 |
| GET/POST | `/api/mobile/orders` | 客户订单列表 / 提交订单 |
| GET | `/api/mobile/orders/:id` | 主子单、付款、发货批次及物流 |
| POST | `/api/mobile/orders/:id/cancel` | 取消未付款订单并释放预占 |
| POST | `/api/mobile/payments` | 创建微信预支付 |
| POST | `/api/mobile/payments/:id/mock-complete` | 测试模式模拟到账 |
| POST | `/api/mobile/shipments/:id/receive` | 按批次确认收货 |
| GET/POST | `/api/mobile/plans` | 采购计划列表 / 新建计划 |
| PUT | `/api/mobile/plans/:id` | 修改草稿或退回计划 |
| POST | `/api/mobile/plans/:id/actions` | 提交或撤回计划 |
| GET/POST | `/api/mobile/after-sales` | 售后记录 / 新建售后 |

## 内部管理

- 客户、产品、价格、库存、供应商、账号、计划、订单、收款、财务、售后和缺货分配均有 `/api/admin/*` 管理接口。
- 计划动作包括 `BANGBANG_APPROVE`、`BANGBANG_REJECT`、`SANLEI_APPROVE`、`SANLEI_REJECT`。
- 订单动作包括 `BANGBANG_CONFIRM`、`SANLEI_ACCEPT`、`SHIP`、`CANCEL`。
- `/api/admin/exports/:kind/xlsx` 导出标准 Excel；`/api/admin/imports/:kind/xlsx` 导入 Excel。
- `/api/admin/shortages/:productId/preview` 返回加权公平分配预览；`/apply` 确认并更新库存预占。

## 微信支付回调

`POST /api/wechat/pay/notify` 使用微信支付平台证书验签，API v3 密钥解密通知，校验支付金额，并以支付单号幂等更新订单。重复通知不会重复增加已付金额。

## 关键业务枚举

- 订单类型：`NORMAL`、`PREPAY`、`NEW_PRODUCT`、`PLAN`、`TEMPORARY`
- 计划状态：`DRAFT`、`BANGBANG_REVIEW`、`SANLEI_REVIEW`、`APPROVED`、`REJECTED`
- 订单状态：`PENDING_BANGBANG`、`PENDING_PAYMENT`、`PARTIALLY_PAID`、`PENDING_SANLEI`、`PREPARING`、`PARTIALLY_SHIPPED`、`SHIPPED`、`COMPLETED`、`CANCELLED`
- 价格来源：`CUSTOMER_SPECIFIC`、`PRICE_TIER`
