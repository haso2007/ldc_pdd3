# PDD 拼团中心 (Linux DO Connect + LDC EasyPay)

这个 Worker 提供一个简单的三人团购发布/审核/奖励流程：
- 发布团购链接需支付 4 LDC（支付给商户账户）。
- 3 名成员提交参团凭证并经管理员审核。
- 三人全部审核通过后，每人奖励 2 LDC（记录为待发放）。
- 24 小时内未完成三人审核则自动退款 4 LDC 给发布者。

不支持站内拼多多登录或站内参团。用户打开官方拼多多链接参团后返回提交证明。

## 部署

### 1) 创建 D1 数据库

```bash
wrangler d1 create pdd-group-db
wrangler d1 execute pdd-group-db --file=schema.sql
```

在 `wrangler.toml` 中将 `database_id` 更新为创建输出的 ID。

### 2) 配置密钥

```bash
wrangler secret put MERCHANT_ID
wrangler secret put MERCHANT_KEY
wrangler secret put OAUTH_CLIENT_ID
wrangler secret put OAUTH_CLIENT_SECRET
wrangler secret put OAUTH_REDIRECT_URI
wrangler secret put ADMIN_USERS
```

说明：
- `ADMIN_USERS` 为 Linux DO 用户名列表，逗号分隔。
- `OAUTH_REDIRECT_URI` 必须与 Linux DO Connect 回调一致，例如 `https://your-domain.com/authcallback`。

### 3) 部署

```bash
wrangler deploy
```

定时任务每 10 分钟运行一次，用于过期与退款处理。

## 管理员使用

1) 使用 `ADMIN_USERS` 内的 Linux DO 账号登录。
2) 访问 `/admin` 查看统计信息。
3) 在 `/admin/proofs` 审核参团凭证。
4) 当同一团达到 3 人审核通过时，系统自动记录奖励。
5) 在 `/admin/rewards` 里手动标记已发放。
6) 如需强制过期，可在 `/admin/groups` 操作。

## 普通用户使用

1) 使用 Linux DO 登录。
2) 在 `/group/new` 创建团并支付 4 LDC。
3) 分享团页面给好友。
4) 参团者打开拼多多链接完成下单。
5) 每个成员在团页面提交参团证明（订单号或截图链接）。
6) 等待管理员审核与奖励发放。

## 配置项

默认值在 `wrangler.toml`，可按需覆盖：
- `GROUP_FEE`（默认 4）
- `GROUP_REWARD`（默认 2）
- `GROUP_EXPIRY_HOURS`（默认 24）

## 限制

- 未接入拼多多 API，凭证审核为人工流程。
- 奖励只记录在数据库中，需手动发放。
