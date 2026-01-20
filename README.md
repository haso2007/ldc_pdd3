# PDD Group Hub (Linux DO Connect + LDC EasyPay)

This worker hosts a simple 3-person group-buy hub:
- Posting a group costs 4 LDC (paid to the merchant).
- 3 members submit proof and get admin approval.
- When all 3 are approved, each member earns 2 LDC (recorded for manual payout).
- If the group is not completed in 24 hours, the post fee is refunded.

PDD login and in-site joining are not supported. Members use the official PDD link and return to submit proof.

## Setup

### 1) Create D1 database

```bash
wrangler d1 create pdd-group-db
wrangler d1 execute pdd-group-db --file=schema.sql
```

Update `database_id` in `wrangler.toml` with the ID from the create output.

### 2) Configure secrets

```bash
wrangler secret put MERCHANT_ID
wrangler secret put MERCHANT_KEY
wrangler secret put OAUTH_CLIENT_ID
wrangler secret put OAUTH_CLIENT_SECRET
wrangler secret put OAUTH_REDIRECT_URI
wrangler secret put ADMIN_USERS
```

Notes:
- `ADMIN_USERS` is a comma-separated list of Linux DO usernames.
- `OAUTH_REDIRECT_URI` must match your Linux DO Connect callback, e.g. `https://your-domain.com/authcallback`.

### 3) Deploy

```bash
wrangler deploy
```

The cron trigger runs every 10 minutes to expire groups and refund when needed.

## Admin usage

1) Login with a Linux DO account in `ADMIN_USERS`.
2) Visit `/admin` to view stats.
3) Review proofs at `/admin/proofs` and approve or reject.
4) When a group reaches 3 approved members, rewards are recorded automatically.
5) Mark payouts at `/admin/rewards` after manual LDC transfers.
6) Use `/admin/groups` to force-expire a group if needed.

## User usage

1) Login via Linux DO.
2) Create a group at `/group/new` and pay the 4 LDC fee.
3) Share the group page with friends.
4) Joiners open the PDD link and complete the order.
5) Each member submits proof (order ID or screenshot URL) on the group page.
6) Wait for admin approval and reward processing.

## Config values

Default values are in `wrangler.toml` and can be overridden:
- `GROUP_FEE` (default 4)
- `GROUP_REWARD` (default 2)
- `GROUP_EXPIRY_HOURS` (default 24)

## Limitations

- No PDD API integration: proofs are manual.
- Reward payouts are tracked in the database and must be paid manually.
